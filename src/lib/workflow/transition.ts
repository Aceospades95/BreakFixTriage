import type { Prisma, PrismaClient, Ticket, TicketState } from "@prisma/client";
import { EmailEvent } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit, type TransitionType } from "@/lib/audit/audit";
import { publish } from "@/lib/events/bus";
import { dispatchEmailEvent } from "@/lib/email/send";
import { getEffectiveNotifyOnEnter, readStatusConfig } from "./status-config";
import {
  GuardFailedError,
  InvalidTransitionError,
  WorkflowError,
} from "./errors";
import { canTransition } from "./states";

/**
 * Round-6 §3A — map the four targeted "enter this state" transitions
 * to their EmailEvent. transitionTicket fires the matching event
 * after the audit + TicketEvent commit, gated on the `notifyOnEnter`
 * flag for the destination state.
 *
 * Other transitions deliberately do NOT auto-fire emails — operators
 * who want notifications on every state change configure a rule on
 * the generic `ticket_status_changed` event instead.
 */
const NOTIFY_EVENT_BY_STATE: Partial<Record<TicketState, EmailEvent>> = {
  IN_REPAIR: EmailEvent.status_in_repair,
  PARTS_ORDERED: EmailEvent.status_parts_ordered,
  CLOSED: EmailEvent.ticket_closed,
};

export interface TransitionOptions {
  /** Human-readable reason for the transition. Recorded in TicketEvent. */
  reason?: string;
  /** Structured payload (e.g. {jobId: "..."}) attached to the event. */
  payload?: Prisma.JsonObject;
  /** User id of the actor. Null for system-initiated transitions. */
  actorUserId?: string | null;
  /** Optional pre-fetched ticket to skip a round trip. */
  ticket?: Ticket;
  /**
   * Admin escape hatch: when true, bypass the state-machine edge check
   * and the guards. Still writes a TicketEvent + AuditLog row so the
   * override is traceable. Callers MUST gate this on a proper role check
   * (ADMIN) before passing `force: true`.
   */
  force?: boolean;
  /**
   * How this transition was triggered. Defaults to "manual" (regular
   * UI form) when not supplied; "forced" is implied by `force: true`
   * regardless of what the caller passes. Other call sites should
   * supply "kanban" (drag-and-drop), "scheduled" (cron / sweep), or
   * "webhook" (inbound integration).
   *
   * Stamped on the audit row's `after.transitionType`. See ADR 0006.
   */
  transitionType?: TransitionType;
}

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Guards that can reject a transition before it is persisted. Each guard is
 * applied for specific target states.
 *
 * Guards are *pure* w.r.t. the DB state visible to the current transaction.
 * They receive the existing ticket row and the transition options.
 */
type Guard = (
  tx: PrismaLike,
  ticket: Ticket,
  to: TicketState,
  opts: TransitionOptions,
) => Promise<void>;

const guards: Record<string, Guard> = {
  requireJobForScheduled: async (tx, ticket, to, opts) => {
    if (to !== "PICKUP_SCHEDULED" && to !== "DELIVERY_SCHEDULED") return;
    const jobId = opts.payload?.jobId;
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new GuardFailedError(
        ticket.id,
        ticket.state,
        to,
        "requireJobForScheduled",
        "payload.jobId is required to schedule",
      );
    }
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new GuardFailedError(
        ticket.id,
        ticket.state,
        to,
        "requireJobForScheduled",
        `Job ${jobId} does not exist`,
      );
    }
  },

  invoiceBeforeClose: async (tx, ticket, to, opts) => {
    if (to !== "CLOSED") return;
    if (!ticket.invoiceRequired) return;
    // Allow override with explicit reason flag
    if (opts.payload?.invoiceOverride === true) {
      if (!opts.reason || opts.reason.length < 5) {
        throw new GuardFailedError(
          ticket.id,
          ticket.state,
          to,
          "invoiceBeforeClose",
          "invoiceOverride requires a substantive reason",
        );
      }
      return;
    }
    // Otherwise require a PurchaseOrder with an invoicedAt timestamp.
    const po = await tx.purchaseOrder.findFirst({
      where: { quote: { ticketId: ticket.id }, invoicedAt: { not: null } },
    });
    if (!po) {
      throw new GuardFailedError(
        ticket.id,
        ticket.state,
        to,
        "invoiceBeforeClose",
        "ticket has invoiceRequired=true but no invoiced PO is attached",
      );
    }
  },

  quoteStateAlignment: async (tx, ticket, to) => {
    if (to === "QUOTE_SENT") {
      const quote = await tx.quote.findFirst({
        where: { ticketId: ticket.id, status: { in: ["DRAFT", "SENT"] } },
      });
      if (!quote) {
        throw new GuardFailedError(
          ticket.id,
          ticket.state,
          to,
          "quoteStateAlignment",
          "no draft/sent Quote exists for this ticket",
        );
      }
    }
    if (to === "QUOTE_APPROVED") {
      const quote = await tx.quote.findFirst({
        where: { ticketId: ticket.id, status: "APPROVED" },
      });
      if (!quote) {
        throw new GuardFailedError(
          ticket.id,
          ticket.state,
          to,
          "quoteStateAlignment",
          "no approved Quote exists for this ticket",
        );
      }
    }
  },
};

function isTransactionClient(
  db: PrismaLike,
): db is Prisma.TransactionClient {
  // PrismaClient exposes $transaction; TransactionClient does not.
  return typeof (db as PrismaClient).$transaction !== "function";
}

/**
 * Core transition logic, assuming it already runs inside a transaction.
 */
async function transitionInTx(
  tx: Prisma.TransactionClient,
  ticketId: string,
  to: TicketState,
  opts: TransitionOptions,
): Promise<Ticket> {
  const ticket =
    opts.ticket ?? (await tx.ticket.findUnique({ where: { id: ticketId } }));
  if (!ticket) {
    throw new WorkflowError(`Ticket ${ticketId} not found`);
  }

  const from = ticket.state;
  if (from === to) {
    // Idempotent no-op; don't write spurious events.
    return ticket;
  }

  if (!opts.force && !canTransition(from, to)) {
    throw new InvalidTransitionError(ticketId, from, to);
  }

  if (!opts.force) {
    for (const guard of Object.values(guards)) {
      await guard(tx, ticket, to, opts);
    }
  }

  const payload: Prisma.JsonObject = { ...(opts.payload ?? {}) };
  if (to === "ON_HOLD") {
    payload.resumeState = from;
  }
  if (opts.force) {
    payload.forced = true;
  }

  const now = new Date();
  const updated = await tx.ticket.update({
    where: { id: ticketId },
    data: {
      state: to,
      stateEnteredAt: now,
      closedAt: to === "CLOSED" ? now : ticket.closedAt,
    },
  });

  await tx.ticketEvent.create({
    data: {
      ticketId,
      fromState: from,
      toState: to,
      actorUserId: opts.actorUserId ?? null,
      reason: opts.reason ?? null,
      payload,
    },
  });

  await writeAudit(
    {
      actorUserId: opts.actorUserId ?? null,
      entityType: "Ticket",
      entityId: ticketId,
      action: opts.force
        ? `transition:force:${from}->${to}`
        : `transition:${from}->${to}`,
      before: { state: from },
      after: { state: to },
      // Mirror reason + transitionType onto every transition's
      // audit row so reviewers can read the why directly off the
      // audit log. Closes findings §3.A2; ADR 0006 captures the
      // Stage-2 plan to promote these to dedicated columns.
      reason: opts.reason ?? null,
      transitionType: opts.force ? "forced" : (opts.transitionType ?? "manual"),
    },
    tx,
  );

  return updated;
}

/**
 * Transition a ticket to a new state. Enforces the state machine, runs
 * guards, writes a TicketEvent, and appends an AuditLog entry.
 *
 * If `db` is a full PrismaClient, the work runs inside a fresh transaction.
 * If `db` is already a TransactionClient (e.g. called from another service
 * inside a transaction), the work runs inline on that transaction so we
 * don't try to open a nested transaction.
 *
 * @throws InvalidTransitionError if the edge is not allowed.
 * @throws GuardFailedError       if a guard refuses the transition.
 */
export async function transitionTicket(
  ticketId: string,
  to: TicketState,
  opts: TransitionOptions = {},
  db: PrismaLike = defaultPrisma,
): Promise<Ticket> {
  if (isTransactionClient(db)) {
    // Caller owns the transaction. They're responsible for publishing
    // after commit — we can't know when the outer tx will settle, and
    // emitting mid-transaction would fire events for changes that
    // might still roll back.
    return transitionInTx(db, ticketId, to, opts);
  }
  const updated = await (db as PrismaClient).$transaction((tx) =>
    transitionInTx(tx, ticketId, to, opts),
  );
  // Publish after commit so SSE subscribers only see persisted edges.
  publish({ topic: "tickets.changed", ticketId });
  // Round-6 §3A — fire the targeted status-change email AFTER the
  // transaction commits so a queued send never references a state
  // that ended up rolled back. Gated on the destination state's
  // `notifyOnEnter` config flag (server-side, authoritative).
  await maybeDispatchTransitionEmail(db as PrismaClient, updated, opts);
  return updated;
}

async function maybeDispatchTransitionEmail(
  db: PrismaClient,
  ticket: Ticket,
  opts: TransitionOptions,
): Promise<void> {
  const event = NOTIFY_EVENT_BY_STATE[ticket.state];
  if (!event) return;
  const config = await readStatusConfig();
  if (!getEffectiveNotifyOnEnter(ticket.state, config)) return;
  try {
    await dispatchEmailEvent(
      event,
      {
        ticketId: ticket.id,
        schoolId: ticket.schoolId,
        actorUserId: opts.actorUserId ?? null,
        variables: {
          ticketId: ticket.id,
          incidentNumber: ticket.incidentNumber,
          state: ticket.state,
          reason: opts.reason ?? null,
        },
      },
      db,
    );
  } catch (err) {
    // A transient dispatch failure must not undo the transition. The
    // EmailLog row that dispatchEmailEvent writes carries the failure
    // detail; surface to ops via /admin/email-log.
    console.error(
      `[transition] email dispatch ${event} failed for ${ticket.id}:`,
      err,
    );
  }
}

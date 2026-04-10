/**
 * Quote lifecycle services.
 *
 * A quote is always attached to a Ticket and moves through this mini
 * state machine:
 *
 *     DRAFT → SENT → APPROVED / DECLINED / NO_RESPONSE
 *                        ↘ CANCELLED (from DRAFT or SENT)
 *
 * The ticket state machine's `quoteStateAlignment` guard enforces that
 * the ticket cannot move to QUOTE_SENT without an active DRAFT/SENT
 * quote, or to QUOTE_APPROVED without an APPROVED quote. This module
 * keeps the quote in sync so those guards can be satisfied, but it does
 * NOT call `transitionTicket` itself — callers decide whether the
 * ticket should move forward, since many workflows create multiple
 * revisions of a quote before sending.
 *
 * The one exception is `sweepExpiredQuotes`, which is responsible for
 * both flipping the quote to NO_RESPONSE *and* pushing the ticket to
 * QUOTE_NO_RESPONSE, because that step is intended to run
 * unattended.
 */

import {
  QuoteStatus,
  TicketState,
  type Prisma,
  type PrismaClient,
  type Quote,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";
import { enqueueNotification, renderQuoteSent } from "@/lib/notifications";

/**
 * Default hold window: ServiceNow tickets with a sent quote wait seven
 * days for a response before auto-expiring to NO_RESPONSE. Override at
 * creation time via `holdDays` on sendQuote.
 */
export const DEFAULT_HOLD_DAYS = 7;

// ---------------------------------------------------------------------------
// createQuote
// ---------------------------------------------------------------------------

export interface CreateQuoteInput {
  ticketId: string;
  amountCents: number | null;
  diagnosticOnly?: boolean;
  notes?: string | null;
  actorUserId: string;
}

/**
 * Create a DRAFT quote attached to a ticket. Also records a QuoteActivity
 * row so the history is visible from the quote detail UI.
 *
 * Callers should typically ensure the ticket is in QUOTE_REQUIRED before
 * creating a quote, but we don't enforce that here — the state machine
 * guards will block the later `transitionTicket(..., QUOTE_SENT)` call
 * if things are out of order.
 */
export async function createQuote(
  input: CreateQuoteInput,
  db: PrismaClient = defaultPrisma,
): Promise<Quote> {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: {
        ticketId: input.ticketId,
        status: QuoteStatus.DRAFT,
        amountCents: input.amountCents ?? null,
        diagnosticOnly: input.diagnosticOnly ?? false,
        notes: input.notes ?? null,
      },
    });
    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: "create",
        actorUserId: input.actorUserId,
        payload: {
          amountCents: input.amountCents ?? null,
          diagnosticOnly: input.diagnosticOnly ?? false,
        },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Quote",
        entityId: quote.id,
        action: "create",
        after: {
          ticketId: input.ticketId,
          amountCents: input.amountCents ?? null,
          diagnosticOnly: input.diagnosticOnly ?? false,
        },
      },
      tx,
    );
    return quote;
  });
}

// ---------------------------------------------------------------------------
// updateDraftQuote
// ---------------------------------------------------------------------------

export interface UpdateDraftQuoteInput {
  quoteId: string;
  amountCents?: number | null;
  diagnosticOnly?: boolean;
  notes?: string | null;
  actorUserId: string;
}

/**
 * Adjust the fields of a DRAFT quote. Once a quote has been SENT its
 * amount is frozen — any changes require a new quote.
 */
export async function updateDraftQuote(
  input: UpdateDraftQuoteInput,
  db: PrismaClient = defaultPrisma,
): Promise<Quote> {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote) throw new Error(`Quote ${input.quoteId} not found`);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new Error(
        `Cannot edit a quote in status ${quote.status}; only DRAFT quotes are editable`,
      );
    }
    const data: Prisma.QuoteUpdateInput = {};
    if (input.amountCents !== undefined) {
      data.amountCents = input.amountCents;
    }
    if (input.diagnosticOnly !== undefined) {
      data.diagnosticOnly = input.diagnosticOnly;
    }
    if (input.notes !== undefined) {
      data.notes = input.notes;
    }
    const updated = await tx.quote.update({
      where: { id: quote.id },
      data,
    });
    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: "edit",
        actorUserId: input.actorUserId,
        payload: data as Prisma.InputJsonObject,
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Quote",
        entityId: quote.id,
        action: "edit",
        before: {
          amountCents: quote.amountCents,
          diagnosticOnly: quote.diagnosticOnly,
          notes: quote.notes,
        },
        after: data as Prisma.InputJsonObject,
      },
      tx,
    );
    return updated;
  });
}

// ---------------------------------------------------------------------------
// sendQuote
// ---------------------------------------------------------------------------

export interface SendQuoteInput {
  quoteId: string;
  actorUserId: string;
  /** Override the default hold window. */
  holdDays?: number;
  /** Reason stamped onto the ticket transition audit event. */
  reason?: string;
}

export interface SendQuoteResult {
  quote: Quote;
  ticketTransitioned: boolean;
}

/**
 * Flip a DRAFT quote to SENT: stamps sentAt, computes holdUntil, then
 * attempts to move the ticket from QUOTE_REQUIRED → QUOTE_SENT. If the
 * ticket is already past QUOTE_SENT (e.g. because another quote was
 * already sent) the ticket transition is skipped and the result's
 * `ticketTransitioned` field is false.
 */
export async function sendQuote(
  input: SendQuoteInput,
  db: PrismaClient = defaultPrisma,
): Promise<SendQuoteResult> {
  const holdDays = input.holdDays ?? DEFAULT_HOLD_DAYS;
  if (holdDays < 0) {
    throw new Error("holdDays must be non-negative");
  }
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: input.quoteId },
      include: {
        ticket: {
          include: {
            school: {
              include: {
                mainContact: true,
              },
            },
          },
        },
      },
    });
    if (!quote) throw new Error(`Quote ${input.quoteId} not found`);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new Error(
        `Cannot send a quote in status ${quote.status}; only DRAFT quotes can be sent`,
      );
    }
    if (quote.amountCents == null && !quote.diagnosticOnly) {
      throw new Error(
        "Cannot send a quote without an amount (unless flagged diagnosticOnly)",
      );
    }

    const now = new Date();
    const holdUntil = new Date(
      now.getTime() + holdDays * 24 * 60 * 60 * 1000,
    );
    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: QuoteStatus.SENT,
        sentAt: now,
        holdUntil,
      },
    });
    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: "send",
        actorUserId: input.actorUserId,
        payload: { holdUntil: holdUntil.toISOString(), holdDays },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Quote",
        entityId: quote.id,
        action: "send",
        after: { holdUntil: holdUntil.toISOString(), holdDays },
      },
      tx,
    );

    let ticketTransitioned = false;
    if (quote.ticket.state === TicketState.QUOTE_REQUIRED) {
      try {
        await transitionTicket(
          quote.ticketId,
          TicketState.QUOTE_SENT,
          {
            actorUserId: input.actorUserId,
            reason: input.reason ?? `Quote ${quote.id} sent`,
            payload: { quoteId: quote.id, holdUntil: holdUntil.toISOString() },
          },
          tx,
        );
        ticketTransitioned = true;
      } catch (err) {
        // Log but don't fail the send — a second quote might be sent
        // while the ticket is already past QUOTE_SENT.
        await writeAudit(
          {
            actorUserId: input.actorUserId,
            entityType: "Ticket",
            entityId: quote.ticketId,
            action: "quote-send:ticket-skip",
            after: {
              reason: err instanceof Error ? err.message : String(err),
              quoteId: quote.id,
            },
          },
          tx,
        );
      }
    }

    // Queue an email to the school's primary contact if we have one.
    // Missing/invalid email is not a failure — the sweep page and UI
    // stay functional even without a mail transport configured.
    const contact = quote.ticket.school.mainContact;
    if (contact?.email && contact.email.includes("@")) {
      const rendered = renderQuoteSent({
        incidentNumber: quote.ticket.incidentNumber,
        schoolName: quote.ticket.school.name,
        amountDollars:
          quote.amountCents != null ? quote.amountCents / 100 : null,
        diagnosticOnly: quote.diagnosticOnly,
        holdUntil,
        requesterName: contact.name ?? null,
      });
      try {
        await enqueueNotification(
          {
            kind: "QUOTE_SENT",
            ticketId: quote.ticketId,
            quoteId: quote.id,
            recipientEmail: contact.email,
            subject: rendered.subject,
            body: rendered.body,
          },
          tx,
        );
      } catch (err) {
        await writeAudit(
          {
            actorUserId: input.actorUserId,
            entityType: "Quote",
            entityId: quote.id,
            action: "quote-send:notify-skip",
            after: {
              reason: err instanceof Error ? err.message : String(err),
            },
          },
          tx,
        );
      }
    }

    return { quote: updated, ticketTransitioned };
  });
}

// ---------------------------------------------------------------------------
// respondToQuote (approve / decline)
// ---------------------------------------------------------------------------

export type QuoteResponse = "APPROVED" | "DECLINED";

export interface RespondToQuoteInput {
  quoteId: string;
  response: QuoteResponse;
  actorUserId: string;
  reason?: string;
}

/**
 * Record a customer response on a SENT quote and move the ticket.
 *
 *   APPROVED: quote → APPROVED, ticket QUOTE_SENT → QUOTE_APPROVED
 *   DECLINED: quote → DECLINED, ticket QUOTE_SENT → QUOTE_DECLINED
 *
 * Ticket transitions are best-effort: if the ticket has already moved
 * on for some other reason we log and continue rather than blocking
 * the quote status update.
 */
export async function respondToQuote(
  input: RespondToQuoteInput,
  db: PrismaClient = defaultPrisma,
): Promise<Quote> {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: input.quoteId },
      include: { ticket: true },
    });
    if (!quote) throw new Error(`Quote ${input.quoteId} not found`);
    if (quote.status !== QuoteStatus.SENT) {
      throw new Error(
        `Cannot respond to a quote in status ${quote.status}; must be SENT`,
      );
    }

    const now = new Date();
    const newStatus =
      input.response === "APPROVED"
        ? QuoteStatus.APPROVED
        : QuoteStatus.DECLINED;
    const targetTicketState =
      input.response === "APPROVED"
        ? TicketState.QUOTE_APPROVED
        : TicketState.QUOTE_DECLINED;

    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: { status: newStatus, respondedAt: now },
    });
    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: input.response === "APPROVED" ? "approve" : "decline",
        actorUserId: input.actorUserId,
        payload: { reason: input.reason ?? null },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Quote",
        entityId: quote.id,
        action: `respond:${input.response.toLowerCase()}`,
        before: { status: quote.status },
        after: { status: newStatus, reason: input.reason ?? null },
      },
      tx,
    );

    if (quote.ticket.state === TicketState.QUOTE_SENT) {
      try {
        await transitionTicket(
          quote.ticketId,
          targetTicketState,
          {
            actorUserId: input.actorUserId,
            reason: input.reason ?? `Quote ${quote.id} ${input.response}`,
            payload: { quoteId: quote.id },
          },
          tx,
        );
      } catch (err) {
        await writeAudit(
          {
            actorUserId: input.actorUserId,
            entityType: "Ticket",
            entityId: quote.ticketId,
            action: "quote-respond:ticket-skip",
            after: {
              reason: err instanceof Error ? err.message : String(err),
              quoteId: quote.id,
            },
          },
          tx,
        );
      }
    }

    return updated;
  });
}

// ---------------------------------------------------------------------------
// cancelQuote
// ---------------------------------------------------------------------------

export interface CancelQuoteInput {
  quoteId: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Cancel a DRAFT or SENT quote. Does not move the ticket. Typically used
 * when a quote was created in error or superseded by a new revision.
 */
export async function cancelQuote(
  input: CancelQuoteInput,
  db: PrismaClient = defaultPrisma,
): Promise<Quote> {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote) throw new Error(`Quote ${input.quoteId} not found`);
    if (
      quote.status !== QuoteStatus.DRAFT &&
      quote.status !== QuoteStatus.SENT
    ) {
      throw new Error(
        `Cannot cancel a quote in status ${quote.status}`,
      );
    }
    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.CANCELLED },
    });
    await tx.quoteActivity.create({
      data: {
        quoteId: quote.id,
        kind: "cancel",
        actorUserId: input.actorUserId,
        payload: { reason: input.reason ?? null },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Quote",
        entityId: quote.id,
        action: "cancel",
        before: { status: quote.status },
        after: { status: QuoteStatus.CANCELLED },
      },
      tx,
    );
    return updated;
  });
}

/**
 * Route stop lifecycle.
 *
 * The driver (or the dispatcher on their behalf) moves each RouteStop
 * through a mini state machine that mirrors the physical trip:
 *
 *     SCHEDULED → EN_ROUTE → ARRIVED → COMPLETED
 *                                    ↘ FAILED
 *
 * Transitions cascade to the underlying Job, the parent Route, and any
 * tickets the job covers:
 *
 *   - first stop moving to EN_ROUTE flips Route: PLANNED → IN_PROGRESS
 *   - every stop in a terminal state flips Route to COMPLETED
 *   - COMPLETED on a PICKUP job transitions each ticket
 *     PICKUP_SCHEDULED → IN_WAREHOUSE
 *   - COMPLETED on a DELIVERY job transitions each ticket
 *     DELIVERY_SCHEDULED → RETURNED
 *   - FAILED reverts the ticket to AWAITING_PICKUP / PENDING_DELIVERY so
 *     the dispatcher can reschedule it
 *
 * Ticket transitions that can't be satisfied (e.g. the ticket already
 * moved past the target state via another path) are audit-logged rather
 * than failing the whole stop update.
 */

import {
  JobStatus,
  JobType,
  StopLineState,
  RouteStatus,
  type PrismaClient,
  type TicketState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { formatStopLabel } from "@/lib/audit/format";
import { humanise } from "@/lib/format";
import { transitionTicket } from "@/lib/workflow";
import {
  describeProofRule,
  evaluateCompletionGate,
  isLineSuccessful,
  proofPresence,
} from "@/lib/scheduling/stop-lines";

/**
 * The set of stop statuses that are exposed as driver-facing actions.
 * Anything else (SCHEDULED, UNSCHEDULED, CANCELLED) is set by other
 * parts of the system.
 */
export const DRIVER_ACTIONABLE_STATUSES: readonly JobStatus[] = [
  JobStatus.EN_ROUTE,
  JobStatus.ARRIVED,
  JobStatus.COMPLETED,
  JobStatus.PARTIAL,
  JobStatus.FAILED,
];

export type StopTransitionCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Pure validator for a stop status transition. Kept as a free function
 * so it can be unit-tested without a database.
 */
export function validateStopStatusTransition(
  from: JobStatus,
  to: JobStatus,
): StopTransitionCheck {
  if (!DRIVER_ACTIONABLE_STATUSES.includes(to)) {
    return {
      ok: false,
      reason: `${humanise(to)} is not a status a driver can set`,
    };
  }
  if (from === to) return { ok: true };

  switch (to) {
    case JobStatus.EN_ROUTE:
      if (from !== JobStatus.SCHEDULED) {
        return { ok: false, reason: `it can't start from ${humanise(from)}` };
      }
      return { ok: true };
    case JobStatus.ARRIVED:
      if (from !== JobStatus.EN_ROUTE) {
        return {
          ok: false,
          reason: `it can't be marked arrived from ${humanise(from)}`,
        };
      }
      return { ok: true };
    case JobStatus.COMPLETED:
    case JobStatus.PARTIAL:
      // Round-22 §1B — Complete (and Partial) strictly require the
      // technician to be on site first. Arrive-before-complete is now
      // enforced, not just suggested.
      if (from !== JobStatus.ARRIVED) {
        return {
          ok: false,
          reason: `you have to be on site first — tap Arrived before ${
            to === JobStatus.PARTIAL ? "saving a partial" : "completing"
          }`,
        };
      }
      return { ok: true };
    case JobStatus.FAILED:
      if (
        from === JobStatus.COMPLETED ||
        from === JobStatus.FAILED ||
        from === JobStatus.CANCELLED
      ) {
        return { ok: false, reason: `it can't fail from ${humanise(from)}` };
      }
      return { ok: true };
    default:
      return { ok: false, reason: `unsupported target ${humanise(to)}` };
  }
}

/** A per-line resolution submitted with a COMPLETED / PARTIAL transition. */
export interface StopLineResolution {
  stopDeviceId: string;
  /** VERIFIED | NOT_FOUND | REFUSED. (EXTRA_ADDED is set at add time.) */
  state: StopLineState;
  note?: string;
}

export interface UpdateStopStatusInput {
  stopId: string;
  status: JobStatus;
  actorUserId: string;
  /** Failure reason (required for FAILED). */
  reason?: string;
  /**
   * Per-line resolutions for a COMPLETED / PARTIAL transition. Every
   * active line on the stop must appear (or already be resolved); the
   * completion gate is enforced from the resulting states inside this
   * same transaction, so a refused transition leaves nothing changed.
   */
  lineResolutions?: StopLineResolution[];
  /**
   * Required when completing/partialling a stop whose proof rule is not
   * satisfied by the attached proof. Flagged on the record + audited as
   * a high-visibility line.
   */
  proofOverrideReason?: string;
  /** Free-text stop notes recorded on site. Persisted when provided. */
  notes?: string;
}

/**
 * Thrown when a transition is refused for a reason the operator can fix
 * (wrong order, unresolved lines, missing proof, concurrent edit).
 * `message` is written for the person holding the phone, not the log
 * file — actions surface it verbatim in the error toast.
 */
export class StopUpdateRefusedError extends Error {}

/** Stop statuses that end the stop's work (no further driver action). */
export const TERMINAL_STOP_STATUSES: readonly JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.PARTIAL,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

/**
 * Apply a stop status transition. Runs inside a single transaction so
 * that the status change, per-line resolutions, proof-override stamp,
 * job/route cascades, ticket transitions, and audit rows land
 * atomically — all or nothing.
 *
 * Idempotency: the status write is guarded on the previously-read
 * status. A concurrent submission that already applied the same target
 * becomes a no-op success; one that applied a different status fails
 * with a reload-and-retry message instead of silently overwriting.
 */
export async function updateStopStatus(
  input: UpdateStopStatusInput,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(async (tx) => {
    const stop = await tx.routeStop.findUnique({
      where: { id: input.stopId },
      include: {
        route: true,
        job: {
          include: {
            ticketLinks: true,
            school: { select: { name: true } },
          },
        },
      },
    });
    if (!stop)
      throw new StopUpdateRefusedError(
        "Stop not found — it may have been removed from the route. Reload the page.",
      );

    const previous = stop.status;
    if (previous === input.status && input.notes === undefined) return stop;

    const check = validateStopStatusTransition(previous, input.status);
    if (!check.ok) {
      throw new StopUpdateRefusedError(`Can't update this stop — ${check.reason}.`);
    }

    if (input.status === JobStatus.FAILED && !input.reason) {
      throw new StopUpdateRefusedError(
        "Pick a reason before failing the stop so dispatch can reschedule it.",
      );
    }

    // Persist stop notes whenever supplied (the "Other — see stop notes"
    // fail reason relies on this field existing).
    if (input.notes !== undefined) {
      await tx.routeStop.update({
        where: { id: stop.id },
        data: { notes: input.notes.trim() || null },
      });
    }

    const completing =
      input.status === JobStatus.COMPLETED ||
      input.status === JobStatus.PARTIAL;

    let proofOverrideApplied = false;
    let lineSummary: Record<string, number> = {};

    if (completing) {
      // 1. Apply the per-line resolutions submitted with this completion.
      const active = await tx.stopDevice.findMany({
        where: { stopId: stop.id, removedAt: null },
        select: { id: true, lineState: true },
      });
      const activeById = new Map(active.map((l) => [l.id, l]));
      for (const res of input.lineResolutions ?? []) {
        const line = activeById.get(res.stopDeviceId);
        if (!line) continue; // ignore stale/foreign ids
        if (
          res.state !== StopLineState.VERIFIED &&
          res.state !== StopLineState.NOT_FOUND &&
          res.state !== StopLineState.REFUSED
        ) {
          continue; // EXTRA_ADDED is set at add time, never here
        }
        const verified = res.state === StopLineState.VERIFIED;
        await tx.stopDevice.update({
          where: { id: line.id },
          data: {
            lineState: res.state,
            lineNote: res.note?.trim() || null,
            // VERIFIED doubles as the durable field check-off stamp.
            confirmedAt: verified ? new Date() : null,
            confirmedByUserId: verified ? input.actorUserId : null,
          },
        });
        line.lineState = res.state;
      }

      // 2. Re-read the resolved lines + attached proof and run the gate.
      const lines = Array.from(activeById.values());
      const attachments = await tx.attachment.findMany({
        where: { routeStopId: stop.id },
        select: { mimeType: true, signerName: true },
      });
      const present = proofPresence(attachments);
      const hasOverride =
        !!input.proofOverrideReason &&
        input.proofOverrideReason.trim().length >= 5;
      const gate = evaluateCompletionGate({
        lines: lines.map((l) => ({ state: l.lineState })),
        proofRule: stop.proofRule,
        proofPresent: present,
        hasProofOverride: hasOverride,
      });

      if (input.status === JobStatus.COMPLETED && !gate.canComplete) {
        if (gate.anyUnsuccessful && gate.allResolved) {
          throw new StopUpdateRefusedError(
            "Some items weren't picked up or delivered — save this stop as Partial instead of Complete.",
          );
        }
        throw new StopUpdateRefusedError(
          gate.blockedReason ?? "This stop can't be completed yet.",
        );
      }
      if (input.status === JobStatus.PARTIAL && !gate.canPartial) {
        throw new StopUpdateRefusedError(
          gate.allResolved
            ? "Partial needs at least one verified item and one that wasn't — otherwise Complete or Fail the stop."
            : (gate.blockedReason ?? "Resolve every line before saving a partial."),
        );
      }

      // 3. Proof override: required when the rule isn't satisfied.
      if (!gate.proofSatisfied) {
        if (!hasOverride) {
          throw new StopUpdateRefusedError(
            `${describeProofRule(stop.proofRule)} Capture it, or give an override reason (5+ characters) to complete without it.`,
          );
        }
        proofOverrideApplied = true;
        await tx.routeStop.update({
          where: { id: stop.id },
          data: {
            proofOverrideReason: input.proofOverrideReason!.trim(),
            proofOverrideByUserId: input.actorUserId,
            proofOverrideAt: new Date(),
          },
        });
      }

      lineSummary = summariseLines(lines.map((l) => l.lineState));
    }

    // Guarded status write — only applies if the status is still what we
    // read. A concurrent identical submission becomes a no-op success.
    const applied = await tx.routeStop.updateMany({
      where: { id: stop.id, status: previous },
      data: {
        status: input.status,
        ...(input.status === JobStatus.FAILED
          ? { failureReason: input.reason ?? null }
          : {}),
      },
    });
    if (applied.count === 0) {
      if (previous === input.status) {
        // notes-only update on an unchanged status — already handled above.
        return { ...stop, status: input.status };
      }
      const current = await tx.routeStop.findUnique({
        where: { id: stop.id },
        select: { status: true },
      });
      if (current?.status === input.status) {
        return { ...stop, status: input.status };
      }
      throw new StopUpdateRefusedError(
        "This stop was updated by someone else while you were working. Reload the page to see its current status before retrying.",
      );
    }
    await tx.job.update({
      where: { id: stop.jobId },
      data: { status: input.status },
    });

    // Per-line ticket cascade. Each ticket moves forward (completed) or
    // back to the reschedule queue (failed) based on its line's outcome.
    if (
      input.status === JobStatus.COMPLETED ||
      input.status === JobStatus.PARTIAL ||
      input.status === JobStatus.FAILED
    ) {
      const stopLabel = formatStopLabel(
        { sequence: stop.sequence, school: stop.job.school },
        { date: stop.route.date },
      );
      await cascadeStopTickets(tx, stop, input, stopLabel);
    }

    // Promote route to IN_PROGRESS on first real movement.
    if (
      (input.status === JobStatus.EN_ROUTE ||
        input.status === JobStatus.ARRIVED) &&
      stop.route.status === RouteStatus.PLANNED
    ) {
      await tx.route.update({
        where: { id: stop.routeId },
        data: { status: RouteStatus.IN_PROGRESS },
      });
    }

    // Route completion rollup (PARTIAL is terminal too).
    const remaining = await tx.routeStop.count({
      where: {
        routeId: stop.routeId,
        status: { notIn: [...TERMINAL_STOP_STATUSES] },
      },
    });
    if (remaining === 0) {
      await tx.route.update({
        where: { id: stop.routeId },
        data: { status: RouteStatus.COMPLETED },
      });
    }

    // Failed and partial stops, and proof overrides, are high-visibility
    // events: warn severity surfaces them on the exceptions dashboard
    // (Phase 2 makes them individually actionable).
    const severity =
      input.status === JobStatus.FAILED ||
      input.status === JobStatus.PARTIAL ||
      proofOverrideApplied
        ? ("warn" as const)
        : ("info" as const);

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "RouteStop",
        entityId: stop.id,
        action: `status:${previous}->${input.status}`,
        before: { status: previous },
        after: {
          status: input.status,
          reason: input.reason ?? null,
          lineSummary,
          proofOverride: proofOverrideApplied
            ? input.proofOverrideReason?.trim()
            : null,
          routeId: stop.routeId,
        },
        reason:
          input.status === JobStatus.FAILED
            ? input.reason ?? null
            : proofOverrideApplied
              ? `Completed without required proof: ${input.proofOverrideReason?.trim()}`
              : null,
        severity,
      },
      tx,
    );

    return { ...stop, status: input.status };
  });
}

function summariseLines(states: StopLineState[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of states) out[s] = (out[s] ?? 0) + 1;
  return out;
}

/**
 * Cascade each ticket on a stop to the right ticket state based on its
 * line's outcome:
 *   - VERIFIED / EXTRA_ADDED → completed cascade (IN_WAREHOUSE / RETURNED)
 *   - NOT_FOUND / REFUSED    → re-queue (AWAITING_PICKUP / PENDING_DELIVERY)
 *   - FAILED stop            → every ticket re-queued
 *   - a ticket with no line  → follows the stop's overall outcome
 */
async function cascadeStopTickets(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  stop: {
    id: string;
    jobId: string;
    sequence: number;
    routeId: string;
    job: { type: JobType; ticketLinks: { ticketId: string }[] };
  },
  input: UpdateStopStatusInput,
  stopLabel: string,
): Promise<void> {
  const activeLines = await tx.stopDevice.findMany({
    where: { stopId: stop.id, removedAt: null, ticketId: { not: null } },
    select: { ticketId: true, lineState: true },
  });

  // ticketId → "completed" | "failed"
  const outcomes = new Map<string, CascadeKind>();
  const stopFailed = input.status === JobStatus.FAILED;
  for (const l of activeLines) {
    if (!l.ticketId) continue;
    const outcome: CascadeKind = stopFailed
      ? "failed"
      : isLineSuccessful(l.lineState)
        ? "completed"
        : "failed";
    outcomes.set(l.ticketId, outcome);
  }
  // Expected tickets with no line row (legacy routes / device-less
  // tickets) follow the stop's overall outcome.
  for (const link of stop.job.ticketLinks) {
    if (outcomes.has(link.ticketId)) continue;
    outcomes.set(link.ticketId, stopFailed ? "failed" : "completed");
  }

  for (const [ticketId, kind] of outcomes) {
    const reason =
      kind === "failed"
        ? input.reason
          ? `${capitalize(stopLabel)} failed: ${input.reason}`
          : `${capitalize(stopLabel)} — item not collected/delivered`
        : `${capitalize(stopLabel)} completed`;
    await cascadeOneTicket(tx, stop.job.type, ticketId, kind, {
      actorUserId: input.actorUserId,
      reason,
      stopId: stop.id,
      jobId: stop.jobId,
    });
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

type CascadeKind = "completed" | "failed";

interface CascadeContext {
  actorUserId: string;
  reason: string;
  stopId: string;
  jobId: string;
}

async function cascadeOneTicket(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  jobType: JobType,
  ticketId: string,
  kind: CascadeKind,
  ctx: CascadeContext,
): Promise<void> {
  return cascadeTicketState(tx, jobType, [ticketId], kind, ctx);
}

async function cascadeTicketState(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  jobType: JobType,
  ticketIds: string[],
  kind: CascadeKind,
  ctx: CascadeContext,
): Promise<void> {
  const target = resolveTicketTarget(jobType, kind);
  if (!target) return;
  for (const ticketId of ticketIds) {
    try {
      await transitionTicket(
        ticketId,
        target,
        {
          actorUserId: ctx.actorUserId,
          reason: ctx.reason,
          payload: { stopId: ctx.stopId, jobId: ctx.jobId },
        },
        tx,
      );
    } catch (err) {
      await writeAudit(
        {
          actorUserId: ctx.actorUserId,
          entityType: "Ticket",
          entityId: ticketId,
          action: `stop-${kind}:skipped`,
          after: {
            reason: err instanceof Error ? err.message : String(err),
            stopId: ctx.stopId,
            jobId: ctx.jobId,
          },
        },
        tx,
      );
    }
  }
}

function resolveTicketTarget(
  jobType: JobType,
  kind: CascadeKind,
): TicketState | null {
  if (kind === "completed") {
    if (jobType === JobType.PICKUP) return "IN_WAREHOUSE";
    if (jobType === JobType.DELIVERY) return "RETURNED";
    return null;
  }
  // failed
  if (jobType === JobType.PICKUP) return "AWAITING_PICKUP";
  if (jobType === JobType.DELIVERY) return "PENDING_DELIVERY";
  return null;
}

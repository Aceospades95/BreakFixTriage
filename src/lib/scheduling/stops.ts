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
  RouteStatus,
  type PrismaClient,
  type TicketState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { humanise } from "@/lib/format";
import { transitionTicket } from "@/lib/workflow";

/**
 * The set of stop statuses that are exposed as driver-facing actions.
 * Anything else (SCHEDULED, UNSCHEDULED, CANCELLED) is set by other
 * parts of the system.
 */
export const DRIVER_ACTIONABLE_STATUSES: readonly JobStatus[] = [
  JobStatus.EN_ROUTE,
  JobStatus.ARRIVED,
  JobStatus.COMPLETED,
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
      if (from !== JobStatus.EN_ROUTE && from !== JobStatus.ARRIVED) {
        return {
          ok: false,
          reason: `it can't be completed from ${humanise(from)}`,
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

export interface UpdateStopStatusInput {
  stopId: string;
  status: JobStatus;
  actorUserId: string;
  reason?: string;
  /**
   * Device lines the operator explicitly checked off on the
   * completion form. Only consulted when `status === COMPLETED`:
   * every active StopDevice line must be in this set or the whole
   * transition is refused (and rolled back — the check-off stamps and
   * the status change land in the same transaction, never partially).
   */
  confirmedDeviceIds?: string[];
}

/**
 * Thrown when a transition is refused for a reason the operator can fix
 * (wrong order, unconfirmed devices, concurrent edit). `message` is
 * written for the person holding the phone, not the log file — actions
 * surface it verbatim in the error toast.
 */
export class StopUpdateRefusedError extends Error {}

/**
 * Apply a stop status transition. Runs inside a single transaction so
 * that the status change, device check-off stamps, job/route cascades,
 * ticket transitions, and audit rows land atomically — all or nothing.
 *
 * Idempotency: the status write is guarded on the previously-read
 * status. If a concurrent submission already applied the same target
 * status (double-tap, retry after a timeout), this call becomes a
 * no-op success — no duplicate audit rows, no duplicate cascades. If
 * the stop moved to a *different* status meanwhile, the call fails
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
        job: { include: { ticketLinks: true } },
      },
    });
    if (!stop) throw new StopUpdateRefusedError("Stop not found — it may have been removed from the route. Reload the page.");

    const previous = stop.status;
    if (previous === input.status) return stop;

    const check = validateStopStatusTransition(previous, input.status);
    if (!check.ok) {
      throw new StopUpdateRefusedError(
        `Can't update this stop: ${check.reason}.`,
      );
    }

    // Per-device confirmation gate (Round-20), now INSIDE the
    // transaction: previously the check + confirmedAt stamps ran
    // before the transaction, so a refused transition left devices
    // stamped as confirmed on a stop that never completed.
    if (input.status === JobStatus.COMPLETED) {
      const confirmedIds = new Set(input.confirmedDeviceIds ?? []);
      const activeLines = await tx.stopDevice.findMany({
        where: { stopId: stop.id, removedAt: null },
        select: {
          id: true,
          device: { select: { assetTag: true, serialNumber: true } },
        },
      });
      const missing = activeLines.filter((l) => !confirmedIds.has(l.id));
      if (missing.length > 0) {
        const label = missing
          .map((l) => l.device.assetTag ?? l.device.serialNumber)
          .slice(0, 3)
          .join(", ");
        throw new StopUpdateRefusedError(
          `Confirm every device before completing the stop — ${missing.length} unconfirmed (${label}${missing.length > 3 ? ", …" : ""}). Check each line off, or remove it from the stop with a reason.`,
        );
      }
      if (activeLines.length > 0) {
        await tx.stopDevice.updateMany({
          where: { stopId: stop.id, removedAt: null, confirmedAt: null },
          data: {
            confirmedAt: new Date(),
            confirmedByUserId: input.actorUserId,
          },
        });
      }
    }

    // Guarded write: only applies if the status is still what we read
    // above. A concurrent transaction that got there first makes this
    // match zero rows instead of silently double-applying.
    const applied = await tx.routeStop.updateMany({
      where: { id: stop.id, status: previous },
      data: {
        status: input.status,
        // Keep the driver's "why failed" pick on the stop itself so
        // dispatch can triage reschedules without the audit log.
        ...(input.status === JobStatus.FAILED
          ? { failureReason: input.reason ?? null }
          : {}),
      },
    });
    if (applied.count === 0) {
      const current = await tx.routeStop.findUnique({
        where: { id: stop.id },
        select: { status: true },
      });
      if (current?.status === input.status) {
        // A concurrent submission (double-tap, retry) already applied
        // exactly this transition. Treat as success without writing a
        // second audit row or re-running the cascades.
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

    if (input.status === JobStatus.COMPLETED) {
      await cascadeTicketState(
        tx,
        stop.job.type,
        stop.job.ticketLinks.map((l) => l.ticketId),
        "completed",
        {
          actorUserId: input.actorUserId,
          reason: `Stop ${stop.id} completed`,
          stopId: stop.id,
          jobId: stop.jobId,
        },
      );
    }

    if (input.status === JobStatus.FAILED) {
      await cascadeTicketState(
        tx,
        stop.job.type,
        stop.job.ticketLinks.map((l) => l.ticketId),
        "failed",
        {
          actorUserId: input.actorUserId,
          reason: input.reason
            ? `Stop ${stop.id} failed: ${input.reason}`
            : `Stop ${stop.id} failed`,
          stopId: stop.id,
          jobId: stop.jobId,
        },
      );
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

    // Route completion rollup.
    const remaining = await tx.routeStop.count({
      where: {
        routeId: stop.routeId,
        status: {
          notIn: [
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
          ],
        },
      },
    });
    if (remaining === 0) {
      await tx.route.update({
        where: { id: stop.routeId },
        data: { status: RouteStatus.COMPLETED },
      });
    }

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "RouteStop",
        entityId: stop.id,
        action: `status:${previous}->${input.status}`,
        before: { status: previous },
        after: { status: input.status, reason: input.reason ?? null },
      },
      tx,
    );

    return { ...stop, status: input.status };
  });
}

type CascadeKind = "completed" | "failed";

interface CascadeContext {
  actorUserId: string;
  reason: string;
  stopId: string;
  jobId: string;
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

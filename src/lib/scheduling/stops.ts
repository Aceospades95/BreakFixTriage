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
      reason: `${to} is not a driver-actionable status`,
    };
  }
  if (from === to) return { ok: true };

  switch (to) {
    case JobStatus.EN_ROUTE:
      if (from !== JobStatus.SCHEDULED) {
        return { ok: false, reason: `cannot start from ${from}` };
      }
      return { ok: true };
    case JobStatus.ARRIVED:
      if (from !== JobStatus.EN_ROUTE) {
        return { ok: false, reason: `cannot mark arrived from ${from}` };
      }
      return { ok: true };
    case JobStatus.COMPLETED:
      if (from !== JobStatus.EN_ROUTE && from !== JobStatus.ARRIVED) {
        return { ok: false, reason: `cannot complete from ${from}` };
      }
      return { ok: true };
    case JobStatus.FAILED:
      if (
        from === JobStatus.COMPLETED ||
        from === JobStatus.FAILED ||
        from === JobStatus.CANCELLED
      ) {
        return { ok: false, reason: `cannot fail from ${from}` };
      }
      return { ok: true };
    default:
      return { ok: false, reason: `unsupported target ${to}` };
  }
}

export interface UpdateStopStatusInput {
  stopId: string;
  status: JobStatus;
  actorUserId: string;
  reason?: string;
}

/**
 * Apply a stop status transition. Runs inside a transaction so that all
 * cascades land atomically.
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
    if (!stop) throw new Error(`RouteStop ${input.stopId} not found`);

    const previous = stop.status;
    if (previous === input.status) return stop;

    const check = validateStopStatusTransition(previous, input.status);
    if (!check.ok) {
      throw new Error(
        `Stop ${input.stopId}: ${check.reason} (target=${input.status})`,
      );
    }

    await tx.routeStop.update({
      where: { id: stop.id },
      data: {
        status: input.status,
        // Keep the driver's "why failed" pick on the stop itself so
        // dispatch can triage reschedules without the audit log.
        ...(input.status === JobStatus.FAILED
          ? { failureReason: input.reason ?? null }
          : {}),
      },
    });
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

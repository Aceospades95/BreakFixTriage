/**
 * Route-level operations: manual reorder and cancellation.
 *
 * Route creation is in jobs.ts alongside createJob because the "build a
 * route from a set of jobs" flow sits naturally with job management. The
 * operations here are the ones that mutate a route *after* it has been
 * built.
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
import { createInAppNotification } from "@/lib/notifications/in-app";
import { DRIVER_ROLES } from "@/lib/scheduling/driver-roles";

export interface ReorderRouteInput {
  routeId: string;
  /** All stop IDs on the route, in the desired new order. */
  orderedStopIds: string[];
  actorUserId: string;
}

/**
 * Replace the stop ordering for a route. Only valid while the route is
 * still in DRAFT or PLANNED status — once a driver has started moving,
 * manual reorder is blocked.
 */
export async function reorderRoute(
  input: ReorderRouteInput,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: input.routeId },
      include: { stops: true },
    });
    if (!route) throw new Error(`Route ${input.routeId} not found`);

    if (
      route.status !== RouteStatus.DRAFT &&
      route.status !== RouteStatus.PLANNED
    ) {
      throw new Error(
        `Cannot reorder a route in status ${route.status}`,
      );
    }

    const existingIds = new Set(route.stops.map((s) => s.id));
    if (input.orderedStopIds.length !== route.stops.length) {
      throw new Error(
        "reorderRoute: orderedStopIds must include every stop on the route exactly once",
      );
    }
    const seen = new Set<string>();
    for (const id of input.orderedStopIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Stop ${id} does not belong to route ${route.id}`);
      }
      if (seen.has(id)) {
        throw new Error(`Stop ${id} appears more than once`);
      }
      seen.add(id);
    }

    // Two-phase update to avoid unique constraint issues if any future
    // schema adds a (routeId, sequence) uniqueness. Prisma currently has
    // none, but this is cheap insurance.
    for (let i = 0; i < input.orderedStopIds.length; i++) {
      const stopId = input.orderedStopIds[i]!;
      await tx.routeStop.update({
        where: { id: stopId },
        data: { sequence: -1 * (i + 1) },
      });
    }
    for (let i = 0; i < input.orderedStopIds.length; i++) {
      const stopId = input.orderedStopIds[i]!;
      await tx.routeStop.update({
        where: { id: stopId },
        data: { sequence: i + 1 },
      });
    }

    await tx.route.update({
      where: { id: route.id },
      data: {
        optimizerName: "manual",
        optimizedAt: new Date(),
      },
    });

    const previousOrder = route.stops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => s.id);

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Route",
        entityId: route.id,
        action: "reorder",
        before: { order: previousOrder },
        after: { order: input.orderedStopIds },
      },
      tx,
    );
  });
}

export interface CancelRouteInput {
  routeId: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Cancel a route that has not yet fully completed. Each non-terminal
 * stop is marked CANCELLED, its job is returned to UNSCHEDULED, and the
 * covered tickets (if still in the SCHEDULED state) fall back to
 * AWAITING_PICKUP / PENDING_DELIVERY so they can be rescheduled.
 */
export async function cancelRoute(
  input: CancelRouteInput,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: input.routeId },
      include: {
        stops: {
          include: { job: { include: { ticketLinks: true } } },
        },
      },
    });
    if (!route) throw new Error(`Route ${input.routeId} not found`);
    if (
      route.status === RouteStatus.COMPLETED ||
      route.status === RouteStatus.CANCELLED
    ) {
      throw new Error(`Cannot cancel route in status ${route.status}`);
    }

    await tx.route.update({
      where: { id: route.id },
      data: { status: RouteStatus.CANCELLED },
    });

    for (const stop of route.stops) {
      if (
        stop.status === JobStatus.COMPLETED ||
        stop.status === JobStatus.CANCELLED
      ) {
        continue;
      }

      await tx.routeStop.update({
        where: { id: stop.id },
        data: { status: JobStatus.CANCELLED },
      });
      await tx.job.update({
        where: { id: stop.jobId },
        data: { status: JobStatus.UNSCHEDULED },
      });

      const fallback: TicketState | null =
        stop.job.type === JobType.PICKUP
          ? "AWAITING_PICKUP"
          : stop.job.type === JobType.DELIVERY
            ? "PENDING_DELIVERY"
            : null;
      if (!fallback) continue;

      for (const link of stop.job.ticketLinks) {
        try {
          await transitionTicket(
            link.ticketId,
            fallback,
            {
              actorUserId: input.actorUserId,
              reason: input.reason
                ? `Route ${route.id} cancelled: ${input.reason}`
                : `Route ${route.id} cancelled`,
              payload: { routeId: route.id, stopId: stop.id },
            },
            tx,
          );
        } catch (err) {
          await writeAudit(
            {
              actorUserId: input.actorUserId,
              entityType: "Ticket",
              entityId: link.ticketId,
              action: "route-cancel:skipped",
              after: {
                reason:
                  err instanceof Error ? err.message : String(err),
                routeId: route.id,
              },
            },
            tx,
          );
        }
      }
    }

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Route",
        entityId: route.id,
        action: "cancel",
        after: { reason: input.reason ?? null },
      },
      tx,
    );
  });
}

/**
 * Jorge's June-18 notes — "change drivers in the calendar in case one
 * is absent": move a route to a different runner. Audited, and both
 * the incoming and outgoing drivers get an in-app notification so an
 * absent driver's replacement finds out without a phone chain.
 *
 * Pure service so the action wrapper stays thin and integration
 * tests can exercise it directly.
 */
export async function reassignRouteDriver(
  input: {
    routeId: string;
    newAssigneeUserId: string;
    actorUserId: string;
  },
  db: PrismaClient = defaultPrisma,
): Promise<{
  routeDate: Date;
  oldDriver: { id: string; name: string };
  newDriver: { id: string; name: string };
  changed: boolean;
}> {
  const route = await db.route.findUnique({
    where: { id: input.routeId },
    select: {
      id: true,
      date: true,
      assigneeUserId: true,
      assignee: { select: { id: true, name: true } },
      _count: { select: { stops: true } },
    },
  });
  if (!route) throw new Error("Route not found");

  const newDriver = await db.user.findUnique({
    where: { id: input.newAssigneeUserId },
    select: { id: true, name: true, active: true, role: true },
  });
  if (!newDriver || !newDriver.active) {
    throw new Error("Pick an active user to run this route");
  }
  if (!DRIVER_ROLES.includes(newDriver.role)) {
    throw new Error(`${newDriver.name} can't be assigned routes (${newDriver.role})`);
  }

  const oldDriver = route.assignee;
  if (oldDriver.id === newDriver.id) {
    return {
      routeDate: route.date,
      oldDriver,
      newDriver: { id: newDriver.id, name: newDriver.name },
      changed: false,
    };
  }

  const dateLabel = route.date.toISOString().slice(0, 10);
  await db.$transaction(async (tx) => {
    await tx.route.update({
      where: { id: route.id },
      data: { assigneeUserId: newDriver.id },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Route",
        entityId: route.id,
        action: "route.driver.reassigned",
        before: { assigneeUserId: oldDriver.id, assignee: oldDriver.name },
        after: { assigneeUserId: newDriver.id, assignee: newDriver.name },
        reason: `Driver ${oldDriver.name} → ${newDriver.name}`,
      },
      tx,
    );
    await createInAppNotification(
      {
        recipientUserId: newDriver.id,
        kind: "GENERIC",
        title: `Route ${dateLabel} is now yours`,
        body: `Reassigned from ${oldDriver.name} — ${route._count.stops} stop${route._count.stops === 1 ? "" : "s"}.`,
        linkHref: `/scheduling/routes/${route.id}`,
      },
      tx,
    );
    await createInAppNotification(
      {
        recipientUserId: oldDriver.id,
        kind: "GENERIC",
        title: `Route ${dateLabel} reassigned to ${newDriver.name}`,
        body: "You're off this route.",
        linkHref: `/scheduling/routes/${route.id}`,
      },
      tx,
    );
  });

  return {
    routeDate: route.date,
    oldDriver,
    newDriver: { id: newDriver.id, name: newDriver.name },
    changed: true,
  };
}

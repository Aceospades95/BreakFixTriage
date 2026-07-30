/**
 * Productivity + repeat-offender reports.
 *
 * Both functions are deliberately narrow Prisma queries, not
 * aggregate-heavy SQL, so they work on any backing store and can be
 * unit-tested with stubs. The productivity query materializes per-
 * assignee counts and a turnaround histogram; the repeat-offender
 * query surfaces devices with N+ tickets inside a rolling window.
 */

import type { Prisma, PrismaClient, TicketState } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Productivity
// ---------------------------------------------------------------------------

export interface ProductivityRow {
  userId: string;
  name: string;
  role: string;
  closedInWindow: number;
  avgTurnaroundDays: number | null;
  openAssigned: number;
  breachedOpen: number;
  totalMinutesLogged: number;
  // Round-22 §4 — field metrics, so a driver's day no longer reads 0.0.
  routesRun: number;
  stopsCompleted: number;
  stopsFailed: number;
  stopsPartial: number;
  devicesVerified: number;
}

/**
 * Build per-assignee productivity rows for the last `windowDays`.
 * `closedInWindow` counts tickets that closed inside the window
 * and were assigned to the user at close time. Turnaround is
 * measured from `reportedAt` → `closedAt` to match how managers
 * actually think about it.
 */
export async function productivityReport(
  windowDays = 30,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
  /**
   * Five-borough expansion — tenant scope for the ticket-derived
   * columns. REPORTS_READ is held by every role, so unscoped this
   * reported citywide throughput to a district user.
   */
  scope: Prisma.TicketWhereInput = {},
): Promise<ProductivityRow[]> {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const users = await db.user.findMany({
    where: { active: true, role: { notIn: ["READ_ONLY"] } },
    select: { id: true, name: true, role: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  // Five-borough expansion — this used to run FOUR queries per user
  // inside a loop: ~120 queries for the pilot's 30 people, but 800
  // for 200 staff, on a page every manager opens. The same data is
  // now fetched in four batched queries and grouped in memory; the
  // per-user maths below is unchanged.
  const scoped = (rest: Prisma.TicketWhereInput): Prisma.TicketWhereInput =>
    Object.keys(scope).length === 0 ? rest : { AND: [scope, rest] };

  const [closedRows, openRows, timeRows, routeRows] = await Promise.all([
    db.ticket.findMany({
      where: scoped({
        assignedUserId: { in: ids },
        state: "CLOSED",
        closedAt: { gte: cutoff },
      }),
      select: { assignedUserId: true, reportedAt: true, closedAt: true },
    }),
    db.ticket.findMany({
      where: scoped({
        assignedUserId: { in: ids },
        state: { notIn: ["CLOSED", "ON_HOLD"] as TicketState[] },
      }),
      select: {
        assignedUserId: true,
        id: true,
        state: true,
        stateEnteredAt: true,
        reportedAt: true,
      },
    }),
    db.timeEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, endedAt: { gte: cutoff } },
      _sum: { minutes: true },
    }),
    db.route.findMany({
      where: { assigneeUserId: { in: ids }, date: { gte: cutoff } },
      select: {
        assigneeUserId: true,
        stops: {
          select: {
            status: true,
            stopDevices: {
              where: { removedAt: null },
              select: { lineState: true },
            },
          },
        },
      },
    }),
  ]);

  function bucket<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  }
  const closedBy = bucket(closedRows, (r) => r.assignedUserId);
  const openBy = bucket(openRows, (r) => r.assignedUserId);
  const routesBy = bucket(routeRows, (r) => r.assigneeUserId);
  const minutesBy = new Map(
    timeRows.map((t) => [t.userId, t._sum.minutes ?? 0]),
  );

  const rows: ProductivityRow[] = [];
  for (const u of users) {
    const closed = closedBy.get(u.id) ?? [];
    const open = openBy.get(u.id) ?? [];
    const routes = routesBy.get(u.id) ?? [];

    const turnaroundDays = closed
      .filter((c) => c.closedAt != null)
      .map(
        (c) =>
          ((c.closedAt as Date).getTime() - c.reportedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
    const avgTurnaroundDays =
      turnaroundDays.length > 0
        ? Number(
            (
              turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length
            ).toFixed(1),
          )
        : null;

    const allStops = routes.flatMap((r) => r.stops);
    const stopsCompleted = allStops.filter(
      (s) => s.status === "COMPLETED" || s.status === "PARTIAL",
    ).length;
    const stopsFailed = allStops.filter((s) => s.status === "FAILED").length;
    const stopsPartial = allStops.filter((s) => s.status === "PARTIAL").length;
    const devicesVerified = allStops.reduce(
      (acc, s) =>
        acc +
        s.stopDevices.filter(
          (d) => d.lineState === "VERIFIED" || d.lineState === "EXTRA_ADDED",
        ).length,
      0,
    );

    rows.push({
      userId: u.id,
      name: u.name,
      role: u.role,
      closedInWindow: closed.length,
      avgTurnaroundDays,
      openAssigned: open.length,
      breachedOpen: 0, // computed separately below where SLA is known
      totalMinutesLogged: minutesBy.get(u.id) ?? 0,
      routesRun: routes.length,
      stopsCompleted,
      stopsFailed,
      stopsPartial,
      devicesVerified,
    });
  }

  // Surface the people who did the most work, by either dimension.
  return rows.sort(
    (a, b) =>
      b.closedInWindow + b.stopsCompleted - (a.closedInWindow + a.stopsCompleted),
  );
}

// ---------------------------------------------------------------------------
// Repeat-offender devices
// ---------------------------------------------------------------------------

export interface DeviceHotspot {
  deviceId: string;
  serialNumber: string;
  assetTag: string | null;
  modelName: string | null;
  schoolName: string;
  ticketCount: number;
  lastReportedAt: Date;
}

/**
 * Devices with at least `threshold` tickets inside the rolling
 * window. Sorted hottest-first. Use `threshold = 3` by default so
 * one-off bad luck doesn't flood the list.
 */
/** Most hotspot rows anyone reads; citywide there can be thousands. */
export const DEVICE_HOTSPOT_LIMIT = 250;

export interface DeviceHotspotResult {
  rows: DeviceHotspot[];
  /** Devices meeting the threshold before the display cap. */
  total: number;
}

export async function deviceHotspots(
  windowDays = 180,
  threshold = 3,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
  /**
   * Five-borough expansion — tenant scope. This report reads every
   * ticket in the window, so unscoped it showed a district user the
   * whole city's device history.
   */
  scope: Prisma.TicketWhereInput = {},
): Promise<DeviceHotspotResult> {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const base: Prisma.TicketWhereInput = {
    deviceId: { not: null },
    reportedAt: { gte: cutoff },
  };
  const groups = await db.ticket.groupBy({
    by: ["deviceId"],
    where: Object.keys(scope).length === 0 ? base : { AND: [scope, base] },
    _count: { _all: true },
    _max: { reportedAt: true },
  });

  const qualifying = groups
    .filter((g) => g.deviceId != null && g._count._all >= threshold)
    .sort((a, b) => b._count._all - a._count._all);
  // The TRUE count, reported alongside the capped page. Returning
  // only the capped rows made "Bronx 250 / Brooklyn 250" read as
  // parity when both were simply clipped — the comparison the
  // per-borough work exists to support is exactly the one that cap
  // was quietly breaking.
  const total = qualifying.length;
  // Cap AFTER sorting so the worst offenders are always the ones
  // shown — an uncapped citywide list is thousands of rows.
  const hot = qualifying.slice(0, DEVICE_HOTSPOT_LIMIT);

  if (hot.length === 0) return { rows: [], total };

  const devices = await db.device.findMany({
    where: { id: { in: hot.map((g) => g.deviceId!) } },
    include: {
      model: true,
      school: { select: { name: true } },
    },
  });
  const byId = new Map(devices.map((d) => [d.id, d]));

  const rows = hot.map((g) => {
    const d = byId.get(g.deviceId!);
    return {
      deviceId: g.deviceId!,
      serialNumber: d?.serialNumber ?? "unknown",
      assetTag: d?.assetTag ?? null,
      modelName: d?.model ? `${d.model.manufacturer} ${d.model.modelName}` : null,
      schoolName: d?.school?.name ?? "unknown",
      ticketCount: g._count._all,
      lastReportedAt: g._max.reportedAt ?? cutoff,
    };
  });
  return { rows, total };
}

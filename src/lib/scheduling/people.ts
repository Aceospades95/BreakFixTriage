/**
 * Round-4 §N2 — staff scheduling helpers.
 *
 * `deriveOnRouteBlocks` is the brief's load-bearing function: it
 * computes ON_ROUTE blocks at read time from `Route` rows; the
 * blocks are NEVER persisted in `StaffSchedule`. The brief is
 * explicit about this — see `docs/adr/0011-staff-schedule.md`.
 *
 * Block shape lines up with the persisted shape so the rendering
 * code can treat both flavours uniformly. The `__derived` flag
 * distinguishes ON_ROUTE-from-Route from anything that ever lands
 * in the DB.
 *
 * Overlap detection is a pure function — used by
 * `createScheduleBlock` to reject impossible writes (e.g. a tech
 * marked PTO 2pm-5pm cannot also be marked WAREHOUSE 3pm-5pm
 * unless an admin explicitly overrides — out of scope for this
 * round).
 */

import {
  type PrismaClient,
  type Route,
  type StaffSchedule,
  StaffScheduleKind,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export interface ScheduleBlock {
  id: string;
  userId: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  kind: StaffScheduleKind;
  note: string | null;
  routeId: string | null;
  /** True when the block was synthesised from a Route row. */
  __derived: boolean;
}

/**
 * Returns ON_ROUTE blocks synthesised from `Route` rows on the
 * given date for the given userIds. Blocks span the route's
 * planned start → end (`Route.plannedStart` / `plannedEnd`); when
 * those columns are null, falls back to a default 9:00–17:00
 * window from `Settings.peopleScheduleDayStart` / `dayEnd` (passed
 * in by the caller so this helper stays pure).
 */
export async function deriveOnRouteBlocks(
  date: Date,
  userIds: string[],
  fallback: { dayStartMinute: number; dayEndMinute: number },
  db: PrismaClient = defaultPrisma,
): Promise<ScheduleBlock[]> {
  if (userIds.length === 0) return [];

  // Pull the routes for the date + assignee set. The schema's
  // `Route` model has `assigneeUserId` and a `date` column —
  // matching the existing src/lib/scheduling/routes.ts shape.
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const routes = await db.route.findMany({
    where: {
      assigneeUserId: { in: userIds },
      date: { gte: start, lt: end },
    },
    select: {
      id: true,
      assigneeUserId: true,
      date: true,
    },
  });

  return routes.map((r) => routeToBlock(r, fallback));
}

function routeToBlock(
  route: Pick<Route, "id" | "assigneeUserId" | "date">,
  fallback: { dayStartMinute: number; dayEndMinute: number },
): ScheduleBlock {
  // Route.plannedStart / plannedEnd don't exist in the current
  // schema; the brief's §N2 schema deltas note them as part of
  // a future extension. Until then, ON_ROUTE blocks span the
  // configured business-hours window. The block UI tooltip
  // surfaces "starts: from route" so operators know it's
  // synthesised.
  return {
    id: `derived:${route.id}`,
    userId: route.assigneeUserId,
    date: route.date,
    startMinute: fallback.dayStartMinute,
    endMinute: fallback.dayEndMinute,
    kind: StaffScheduleKind.ON_ROUTE,
    note: null,
    routeId: route.id,
    __derived: true,
  };
}

/**
 * Pure overlap detection. Two blocks overlap if their intervals
 * intersect on the same `(userId, date)`. PTO over the whole day
 * is represented as `[0, 24*60]`.
 *
 * Used by `createScheduleBlock` to short-circuit before a DB
 * insert; also exported for unit tests. The implementation is
 * the standard `aStart < bEnd && bStart < aEnd` check.
 */
export function blocksOverlap(
  a: { userId: string; date: Date; startMinute: number; endMinute: number },
  b: { userId: string; date: Date; startMinute: number; endMinute: number },
): boolean {
  if (a.userId !== b.userId) return false;
  if (sameDayUTC(a.date, b.date) === false) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

function sameDayUTC(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Returns the merged set of persisted + derived blocks for a
 * date, sorted by (userId, startMinute). Caller owns the
 * fallback `{dayStartMinute, dayEndMinute}` values from
 * Settings.peopleSchedule*.
 */
export async function getPeopleScheduleForDate(
  date: Date,
  userIds: string[],
  fallback: { dayStartMinute: number; dayEndMinute: number },
  db: PrismaClient = defaultPrisma,
): Promise<ScheduleBlock[]> {
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [persisted, derived] = await Promise.all([
    db.staffSchedule.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: start, lt: end },
      },
      orderBy: [{ userId: "asc" }, { startMinute: "asc" }],
    }),
    deriveOnRouteBlocks(date, userIds, fallback, db),
  ]);

  const merged: ScheduleBlock[] = [
    ...persisted.map(persistedToBlock),
    ...derived,
  ];
  merged.sort((a, b) =>
    a.userId === b.userId
      ? a.startMinute - b.startMinute
      : a.userId.localeCompare(b.userId),
  );
  return merged;
}

function persistedToBlock(s: StaffSchedule): ScheduleBlock {
  return {
    id: s.id,
    userId: s.userId,
    date: s.date,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    kind: s.kind,
    note: s.note ?? null,
    routeId: s.routeId ?? null,
    __derived: false,
  };
}

/**
 * Round-22 §3.1 — merged persisted + derived blocks across a date
 * RANGE `[from, to)`, for the week/month views on /scheduling/people.
 * One query per source (not one per day) so a month view stays cheap.
 */
export async function getPeopleScheduleForRange(
  from: Date,
  to: Date,
  userIds: string[],
  fallback: { dayStartMinute: number; dayEndMinute: number },
  db: PrismaClient = defaultPrisma,
): Promise<ScheduleBlock[]> {
  if (userIds.length === 0) return [];
  const [persisted, routes] = await Promise.all([
    db.staffSchedule.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lt: to } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    }),
    db.route.findMany({
      where: { assigneeUserId: { in: userIds }, date: { gte: from, lt: to } },
      select: { id: true, assigneeUserId: true, date: true },
    }),
  ]);
  return [
    ...persisted.map(persistedToBlock),
    ...routes.map((r) => routeToBlock(r, fallback)),
  ];
}

/** Local YYYY-MM-DD key for grouping blocks by calendar day. */
export function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Driver availability: returns the windows on a given date when
 * the driver has NO scheduled block AND no derived ON_ROUTE block.
 * Output is sorted ascending. Used by `/scheduling/build-route` to
 * filter the driver picker.
 */
export async function getDriverAvailability(
  driverId: string,
  date: Date,
  fallback: { dayStartMinute: number; dayEndMinute: number },
  db: PrismaClient = defaultPrisma,
): Promise<Array<{ startMinute: number; endMinute: number }>> {
  const blocks = await getPeopleScheduleForDate(
    date,
    [driverId],
    fallback,
    db,
  );
  // Treat every existing block as "busy". Subtract from the
  // configured business-hours window.
  const busy = [...blocks]
    .filter((b) => b.userId === driverId)
    .map((b) => ({ start: b.startMinute, end: b.endMinute }))
    .sort((a, b) => a.start - b.start);
  const out: Array<{ startMinute: number; endMinute: number }> = [];
  let cursor = fallback.dayStartMinute;
  for (const b of busy) {
    if (b.start > cursor) {
      out.push({ startMinute: cursor, endMinute: Math.min(b.start, fallback.dayEndMinute) });
    }
    cursor = Math.max(cursor, b.end);
    if (cursor >= fallback.dayEndMinute) break;
  }
  if (cursor < fallback.dayEndMinute) {
    out.push({ startMinute: cursor, endMinute: fallback.dayEndMinute });
  }
  return out.filter((w) => w.endMinute > w.startMinute);
}

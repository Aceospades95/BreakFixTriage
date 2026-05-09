import type { PrismaClient, TicketState } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { isAgingOpenTicket } from "@/lib/reports/sla";
import { monthBuckets } from "@/lib/charts/buckets";

/**
 * Queries that back the operational dashboards. Kept as a thin layer over
 * Prisma so they remain testable with a seeded DB.
 */

export async function openTicketsByState(db: PrismaClient = defaultPrisma) {
  const rows = await db.ticket.groupBy({
    by: ["state"],
    _count: { _all: true },
    where: { state: { not: "CLOSED" } },
  });
  return rows
    .map((r) => ({ state: r.state, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function closedTicketsByMonth(
  db: PrismaClient = defaultPrisma,
  months = 12,
) {
  // Round-4 §J27: bucket via the canonical monthBuckets helper.
  // The Round-3 implementation did `date_trunc('month', closedAt)`
  // server-side and returned only months with data — so a chart
  // with one month of data rendered one giant bar. The monthBuckets
  // helper emits zero-count buckets too, fixing the "one solid
  // green block" symptom.
  const now = new Date();
  // Range: from the START of the bucket `months - 1` months ago,
  // through `now`. monthBuckets internally floors `from` to month
  // start, so this is safe.
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
  );
  const closed = await db.ticket.findMany({
    where: { closedAt: { gte: from, lte: now }, NOT: { closedAt: null } },
    select: { closedAt: true },
  });
  const buckets = monthBuckets(
    from,
    now,
    closed
      .map((t) => t.closedAt)
      .filter((d): d is Date => d != null),
  );
  // Keep the legacy shape `{ month: Date, count: number }` so the
  // existing chart renderer (MonthBars in dashboards/page.tsx)
  // doesn't change. `month` is the first day of the bucket.
  return buckets.map((b) => ({ month: b.start, count: b.count }));
}

export async function ticketsBySchool(
  db: PrismaClient = defaultPrisma,
  { open = true }: { open?: boolean } = {},
) {
  return db.ticket.groupBy({
    by: ["schoolId"],
    _count: { _all: true },
    where: open ? { state: { not: "CLOSED" } } : {},
  });
}

/**
 * Tickets that have been open for *strictly* more than `thresholdDays`
 * full days, anchored at `reportedAt`. Uses the canonical
 * `isAgingOpenTicket` helper from `@/lib/reports/sla` so the cutoff
 * matches every other place that says "aging > N days".
 *
 * The DB-side filter uses millisecond arithmetic (rounded so an
 * exactly-N-day-old ticket never crosses), then we re-check each
 * candidate against the canonical helper to make absolutely sure the
 * boundary case is right. This costs at most 100 extra integer compares
 * per call and protects against future timezone / DST drift in the
 * cutoff math.
 */
export async function agingTickets(
  db: PrismaClient = defaultPrisma,
  {
    thresholdDays = 30,
    now = new Date(),
  }: { thresholdDays?: number; now?: Date } = {},
) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // For "age_days > thresholdDays" we need
  // `now - reportedAt >= (thresholdDays + 1) * DAY`,
  // i.e. `reportedAt <= now - (thresholdDays + 1) * DAY`.
  const cutoff = new Date(
    now.getTime() - (thresholdDays + 1) * MS_PER_DAY,
  );
  const candidates = await db.ticket.findMany({
    where: {
      state: { not: "CLOSED" },
      reportedAt: { lte: cutoff },
    },
    orderBy: { reportedAt: "asc" },
    include: { school: true, device: true },
    take: 100,
  });
  // Defensive re-check using the canonical helper, so the boundary
  // case stays right even if the millisecond math drifts in some
  // future Prisma / Postgres tz quirk.
  return candidates.filter((t) => isAgingOpenTicket(t, now, thresholdDays));
}

export async function duplicateQueueCount(db: PrismaClient = defaultPrisma) {
  return db.duplicateConflict.count({ where: { resolvedAt: null } });
}

export async function invoiceQueueCount(db: PrismaClient = defaultPrisma) {
  const states: TicketState[] = ["INVOICE_REQUIRED"];
  return db.ticket.count({ where: { state: { in: states } } });
}

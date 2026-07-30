import type { Prisma, PrismaClient, TicketState } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { isAgingOpenTicket } from "@/lib/reports/sla";
import { monthBuckets } from "@/lib/charts/buckets";
import { duplicateQueueCounts } from "@/lib/duplicates/counts";
import { IMPORTED_BACKLOG_THRESHOLD_MS } from "@/lib/exceptions/counts";

/**
 * Queries that back the operational dashboards. Kept as a thin layer over
 * Prisma so they remain testable with a seeded DB.
 *
 * Five-borough expansion — every function takes a `scope`
 * (ticketWhereForSession) and ANDs it in. The dashboards are
 * REPORTS_READ, which every role holds, so before this a Bronx tech
 * saw citywide totals. Scope defaults to {} so existing callers and
 * tests keep working, and admins pass {} legitimately.
 */

function scoped(
  scope: Prisma.TicketWhereInput,
  rest: Prisma.TicketWhereInput,
): Prisma.TicketWhereInput {
  return Object.keys(scope).length === 0 ? rest : { AND: [scope, rest] };
}

export async function openTicketsByState(
  db: PrismaClient = defaultPrisma,
  scope: Prisma.TicketWhereInput = {},
) {
  const rows = await db.ticket.groupBy({
    by: ["state"],
    _count: { _all: true },
    where: scoped(scope, { state: { not: "CLOSED" } }),
  });
  return rows
    .map((r) => ({ state: r.state, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function closedTicketsByMonth(
  db: PrismaClient = defaultPrisma,
  months = 12,
  scope: Prisma.TicketWhereInput = {},
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
    // `state: "CLOSED"` matters: transitionTicket sets closedAt on
    // entry to CLOSED but never clears it on the way back out, and
    // CLOSED -> REOPENED is a legal transition. Filtering on closedAt
    // alone counts reopened work as closed, which both overstates
    // this chart and makes it disagree with the per-borough report
    // (src/lib/reports/boroughs.ts) that applies the same predicate.
    where: scoped(scope, {
      state: "CLOSED",
      closedAt: { gte: from, lte: now },
    }),
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
  scope: Prisma.TicketWhereInput = {},
) {
  return db.ticket.groupBy({
    by: ["schoolId"],
    _count: { _all: true },
    where: scoped(scope, open ? { state: { not: "CLOSED" } } : {}),
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
  scope: Prisma.TicketWhereInput = {},
) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // For "age_days > thresholdDays" we need
  // `now - reportedAt >= (thresholdDays + 1) * DAY`,
  // i.e. `reportedAt <= now - (thresholdDays + 1) * DAY`.
  const cutoff = new Date(
    now.getTime() - (thresholdDays + 1) * MS_PER_DAY,
  );
  const candidates = await db.ticket.findMany({
    where: scoped(scope, {
      state: { not: "CLOSED" },
      reportedAt: { lte: cutoff },
    }),
    orderBy: { reportedAt: "asc" },
    include: { school: true, device: true },
    take: 100,
  });
  // Defensive re-check using the canonical helper, so the boundary
  // case stays right even if the millisecond math drifts in some
  // future Prisma / Postgres tz quirk.
  return candidates.filter((t) => isAgingOpenTicket(t, now, thresholdDays));
}

/**
 * The TRUE number of aging tickets. `agingTickets` caps its row list
 * at 100 for rendering; at citywide volume there can be thousands, so
 * the dashboard tile must not report the cap as the total (the same
 * capped-list-as-total bug the audit rounds found on bench-history).
 */
export async function agingTicketsCount(
  db: PrismaClient = defaultPrisma,
  { thresholdDays = 30, now = new Date() }: { thresholdDays?: number; now?: Date } = {},
  scope: Prisma.TicketWhereInput = {},
) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - (thresholdDays + 1) * MS_PER_DAY);
  return db.ticket.count({
    where: scoped(scope, {
      state: { not: "CLOSED" },
      reportedAt: { lte: cutoff },
    }),
  });
}

export async function duplicateQueueCount(
  db: PrismaClient = defaultPrisma,
  scope: Prisma.TicketWhereInput = {},
) {
  // QA audit BUG-1 — delegate to the shared queue count so this tile
  // (and the digest) can never disagree with the /duplicates page.
  // Counting only DuplicateConflict rows here missed unlinked
  // synthetics entirely.
  const counts = await duplicateQueueCounts(db, scope);
  return counts.total;
}

export async function invoiceQueueCount(
  db: PrismaClient = defaultPrisma,
  scope: Prisma.TicketWhereInput = {},
) {
  const states: TicketState[] = ["INVOICE_REQUIRED"];
  return db.ticket.count({ where: scoped(scope, { state: { in: states } }) });
}

/**
 * QA audit BUG-5 — the triage bottleneck as its own number: tickets
 * that arrived via import and have sat in IMPORTED for 30+ days with
 * no triage started. Distinct from the generic aging metric, which
 * blends every open state together and hid this backlog (242 of 270
 * open tickets were stuck at IMPORTED while "aging" read as routine).
 */
export async function importedBacklogCount(
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
  scope: Prisma.TicketWhereInput = {},
) {
  return db.ticket.count({
    where: scoped(scope, {
      state: "IMPORTED",
      stateEnteredAt: {
        lt: new Date(now.getTime() - IMPORTED_BACKLOG_THRESHOLD_MS),
      },
    }),
  });
}

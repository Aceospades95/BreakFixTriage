import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { andTicketWhere } from "@/lib/data/forSession";
import { sortBoroughs } from "@/lib/geo/boroughs";
import { slaBreachedWhere } from "@/lib/reports/sla-filter";
import { getSlaThresholds } from "@/lib/settings/settings";
import { IMPORTED_BACKLOG_THRESHOLD_MS } from "@/lib/exceptions/counts";

/**
 * Per-borough comparison report.
 *
 * A borough FILTER answers "how is the Bronx doing". It cannot answer
 * "how do the five compare", which is the question a citywide
 * operation actually has — so this rolls every metric up by borough
 * in one pass.
 *
 * Two deliberate design choices:
 *
 * 1. Every metric is derived from the SAME helper the rest of the app
 *    uses — slaBreachedWhere + getSlaThresholds for breached, the
 *    shared IMPORTED_BACKLOG_THRESHOLD_MS for the triage backlog, the
 *    same 30-day aging cutoff as the dashboard. Two pages showing
 *    "the same" number and disagreeing is a failure this codebase has
 *    been bitten by repeatedly, so there is no second definition here.
 *
 * 2. Districts whose region is unset roll into an explicit
 *    "Unassigned" row rather than being dropped. The borough rows
 *    therefore always sum to the citywide total, which is what makes
 *    the report trustworthy — a silently-missing bucket would make
 *    every column quietly wrong.
 *
 * Cost: a fixed number of groupBy queries (not one per borough), each
 * grouped by schoolId and rolled school -> district -> borough in
 * memory. ~1,500 school rows is trivial to fold, and the query count
 * does not grow when boroughs or districts are added.
 */

export const UNASSIGNED_BOROUGH = "Unassigned";

export interface BoroughReportRow {
  borough: string;
  districts: number;
  schools: number;
  openTickets: number;
  aging: number;
  breached: number;
  importedBacklog: number;
  closedInWindow: number;
  /** Mean days from reportedAt to closedAt for the window, or null. */
  avgTurnaroundDays: number | null;
}

export interface BoroughReport {
  rows: BoroughReportRow[];
  total: BoroughReportRow;
  windowDays: number;
  /** Start of the closure window — drill-through links bound on this. */
  windowStart: Date;
  agingThresholdDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The no-triage backlog threshold in whole days, derived from the
 * shared millisecond constant so the drill-through link and the
 * metric can never be typed differently.
 */
export const IMPORTED_BACKLOG_DAYS = Math.round(
  IMPORTED_BACKLOG_THRESHOLD_MS / MS_PER_DAY,
);

export async function boroughRollup(
  db: PrismaClient = defaultPrisma,
  {
    windowDays = 30,
    agingThresholdDays = 30,
    scope = {},
    districtIds = null,
    now = new Date(),
  }: {
    windowDays?: number;
    agingThresholdDays?: number;
    /** Tenant (and optionally borough) scope for the ticket counts. */
    scope?: Prisma.TicketWhereInput;
    /**
     * District ids the actor may see, or null for unrestricted. The
     * district and school columns are NOT ticket queries, so the
     * ticket `scope` does not reach them — without this a Bronx user
     * saw "Manhattan — 8 districts, 291 schools, 0 open", which looks
     * like a borough with no work rather than one they can't see.
     */
    districtIds?: string[] | null;
    now?: Date;
  } = {},
): Promise<BoroughReport> {
  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);
  // Same arithmetic as agingTickets(): "more than N full days".
  const agingCutoff = new Date(
    now.getTime() - (agingThresholdDays + 1) * MS_PER_DAY,
  );
  const importedCutoff = new Date(
    now.getTime() - IMPORTED_BACKLOG_THRESHOLD_MS,
  );
  const thresholds = await getSlaThresholds(db);

  const open: Prisma.TicketWhereInput = { state: { not: "CLOSED" } };

  // Deliberately TWO bounded batches, not one 7-wide Promise.all.
  //
  // src/lib/db/prisma.ts pins connection_limit=10 for the whole
  // process. A 7-query fan-out means a single viewer of this page
  // holds 70% of the pool for the duration of the slowest query, and
  // a second viewer — or the same person clicking Export CSV, which
  // runs the identical set — pushes it over. What fails then is not
  // this page: it is whatever unrelated request is waiting on a
  // connection (a ticket save, an SSE stream) timing out with P2024.
  // These queries take hundreds of milliseconds, so serialising them
  // into batches of four costs far less than starving the pool.
  const [districts, schools, openRows, agingRows] = await Promise.all([
    db.district.findMany({
      where: districtIds ? { id: { in: districtIds } } : {},
      select: { id: true, name: true, region: true },
    }),
    db.school.findMany({
      where: districtIds ? { districtId: { in: districtIds } } : {},
      select: { id: true, districtId: true },
    }),
    db.ticket.groupBy({
      by: ["schoolId"],
      where: andTicketWhere(scope, open),
      _count: { _all: true },
    }),
    db.ticket.groupBy({
      by: ["schoolId"],
      where: andTicketWhere(scope, open, {
        reportedAt: { lte: agingCutoff },
      }),
      _count: { _all: true },
    }),
  ]);

  const [breachedRows, backlogRows, closedRows] = await Promise.all([
    db.ticket.groupBy({
      by: ["schoolId"],
      where: andTicketWhere(scope, slaBreachedWhere(thresholds, now)),
      _count: { _all: true },
    }),
    db.ticket.groupBy({
      by: ["schoolId"],
      where: andTicketWhere(scope, {
        state: "IMPORTED",
        stateEnteredAt: { lt: importedCutoff },
      }),
      _count: { _all: true },
    }),
    // Turnaround needs the two timestamps, so this one is rows not
    // counts — bounded by the window, not by table size.
    //
    // `state: "CLOSED"` is load-bearing, not belt-and-braces:
    // transitionTicket never CLEARS closedAt when a ticket leaves
    // CLOSED (CLOSED -> REOPENED is a legal move), so filtering on
    // closedAt alone counts a reopened ticket as both open AND
    // closed-in-window, and folds its first-closure duration into
    // average turnaround as though the work had finished. It also
    // makes this cell exceed the state=CLOSED list it links to.
    db.ticket.findMany({
      where: andTicketWhere(scope, {
        state: "CLOSED",
        closedAt: { gte: windowStart, lte: now },
      }),
      select: { schoolId: true, reportedAt: true, closedAt: true },
    }),
  ]);

  const regionOf = new Map<string, string>();
  for (const d of districts) {
    regionOf.set(d.id, d.region?.trim() || UNASSIGNED_BOROUGH);
  }
  const boroughOfSchool = new Map<string, string>();
  for (const s of schools) {
    boroughOfSchool.set(s.id, regionOf.get(s.districtId) ?? UNASSIGNED_BOROUGH);
  }

  const blank = (borough: string): BoroughReportRow => ({
    borough,
    districts: 0,
    schools: 0,
    openTickets: 0,
    aging: 0,
    breached: 0,
    importedBacklog: 0,
    closedInWindow: 0,
    avgTurnaroundDays: null,
  });

  const acc = new Map<string, BoroughReportRow>();
  const turnaround = new Map<string, number[]>();
  const row = (borough: string): BoroughReportRow => {
    let r = acc.get(borough);
    if (!r) {
      r = blank(borough);
      acc.set(borough, r);
    }
    return r;
  };

  for (const d of districts) row(regionOf.get(d.id)!).districts += 1;
  for (const s of schools) row(boroughOfSchool.get(s.id)!).schools += 1;

  const fold = (
    rows: { schoolId: string; _count: { _all: number } }[],
    field: "openTickets" | "aging" | "breached" | "importedBacklog",
  ) => {
    for (const g of rows) {
      const b = boroughOfSchool.get(g.schoolId) ?? UNASSIGNED_BOROUGH;
      row(b)[field] += g._count._all;
    }
  };
  fold(openRows, "openTickets");
  fold(agingRows, "aging");
  fold(breachedRows, "breached");
  fold(backlogRows, "importedBacklog");

  for (const t of closedRows) {
    const b = boroughOfSchool.get(t.schoolId) ?? UNASSIGNED_BOROUGH;
    const r = row(b);
    r.closedInWindow += 1;
    if (t.closedAt) {
      const days = (t.closedAt.getTime() - t.reportedAt.getTime()) / MS_PER_DAY;
      const list = turnaround.get(b);
      if (list) list.push(days);
      else turnaround.set(b, [days]);
    }
  }
  for (const [borough, days] of turnaround) {
    if (days.length === 0) continue;
    row(borough).avgTurnaroundDays = Number(
      (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1),
    );
  }

  // Drop boroughs with nothing at all to say, but never drop one that
  // has schools — "Queens: 0 open" is a real and useful answer.
  const rows = [...acc.values()].filter(
    (r) =>
      r.schools > 0 ||
      r.openTickets > 0 ||
      r.closedInWindow > 0 ||
      r.importedBacklog > 0,
  );

  const named = sortBoroughs(
    rows.map((r) => r.borough).filter((b) => b !== UNASSIGNED_BOROUGH),
  );
  const ordered = [
    ...named.map((b) => rows.find((r) => r.borough === b)!),
    ...rows.filter((r) => r.borough === UNASSIGNED_BOROUGH),
  ];

  // Totals are summed from the rows, so the footer can never
  // disagree with the body.
  const total = blank("All boroughs");
  const allTurnaround: number[] = [];
  for (const list of turnaround.values()) allTurnaround.push(...list);
  for (const r of ordered) {
    total.districts += r.districts;
    total.schools += r.schools;
    total.openTickets += r.openTickets;
    total.aging += r.aging;
    total.breached += r.breached;
    total.importedBacklog += r.importedBacklog;
    total.closedInWindow += r.closedInWindow;
  }
  total.avgTurnaroundDays =
    allTurnaround.length > 0
      ? Number(
          (
            allTurnaround.reduce((a, b) => a + b, 0) / allTurnaround.length
          ).toFixed(1),
        )
      : null;

  return { rows: ordered, total, windowDays, windowStart, agingThresholdDays };
}

import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { ticketWhereForBorough } from "@/lib/geo/boroughs";
import {
  boroughOptions,
  districtIdsFor,
  normalizeBorough,
} from "@/lib/geo/borough-options";
import { boroughRollup, UNASSIGNED_BOROUGH } from "@/lib/reports/boroughs";
import type { BreakFixSession } from "@/lib/auth/session";

/**
 * The per-borough comparison report.
 *
 * The property that makes this report trustworthy is that the rows
 * RECONCILE — every ticket lands in exactly one borough bucket, so
 * the rows always sum to the citywide figure. A district whose region
 * was never filled in must therefore fall into an explicit
 * "Unassigned" row rather than silently disappearing, which is what
 * most of these tests are checking.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const TAG = `brr-${Date.now()}`;
const NORTH = `Northshire-${TAG}`;
const SOUTH = `Southshire-${TAG}`;

function sessionFor(
  districtIds: string[],
  role: BreakFixSession["role"] = "DISPATCHER",
): BreakFixSession {
  return {
    userId: "test-user",
    name: "Scoped User",
    email: "scoped@test.local",
    role,
    districtIds,
  } as BreakFixSession;
}

describe.skipIf(!process.env.DATABASE_URL)("boroughRollup", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${TAG}` } },
    });
    await prisma.school.deleteMany({
      where: { code: { startsWith: `SC-${TAG}` } },
    });
    await prisma.district.deleteMany({
      where: { code: { startsWith: `D-${TAG}` } },
    });
    await prisma.$disconnect();
  });

  // Built once — the same district codes cannot be inserted twice.
  let fx: Awaited<ReturnType<typeof buildFixture>> | null = null;
  async function fixture() {
    if (fx) return fx;
    fx = await buildFixture();
    return fx;
  }

  const now = new Date("2026-07-30T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  async function buildFixture() {
    const north = await prisma.district.create({
      data: { code: `D-${TAG}-N`, name: `North ${TAG}`, region: NORTH },
    });
    const south = await prisma.district.create({
      data: { code: `D-${TAG}-S`, name: `South ${TAG}`, region: SOUTH },
    });
    // Deliberately region-less: this is the district that used to
    // vanish from the report and break reconciliation.
    const nowhere = await prisma.district.create({
      data: { code: `D-${TAG}-U`, name: `Nowhere ${TAG}`, region: null },
    });

    const ns = await prisma.school.create({
      data: { code: `SC-${TAG}-N`, name: `North School`, districtId: north.id },
    });
    const ss = await prisma.school.create({
      data: { code: `SC-${TAG}-S`, name: `South School`, districtId: south.id },
    });
    const us = await prisma.school.create({
      data: {
        code: `SC-${TAG}-U`,
        name: `Nowhere School`,
        districtId: nowhere.id,
      },
    });

    const mk = (
      key: string,
      schoolId: string,
      data: Parameters<typeof prisma.ticket.create>[0]["data"] extends infer D
        ? Partial<Record<string, unknown>>
        : never,
    ) =>
      prisma.ticket.create({
        data: {
          incidentNumber: `INC${TAG}-${key}`,
          schoolId,
          shortDescription: "rollup fixture",
          state: "TRIAGE",
          reportedAt: now,
          ...data,
        } as never,
      });

    // North: 2 open (one of them aged past 30d), 1 closed 5 days ago
    // with a 10-day turnaround.
    await mk("N-open", ns.id, { state: "TRIAGE", reportedAt: daysAgo(2) });
    await mk("N-aged", ns.id, { state: "TRIAGE", reportedAt: daysAgo(60) });
    await mk("N-closed", ns.id, {
      state: "CLOSED",
      reportedAt: daysAgo(15),
      closedAt: daysAgo(5),
    });

    // South: 1 open, plus an IMPORTED ticket that entered that state
    // 45 days ago (the no-triage backlog).
    await mk("S-open", ss.id, { state: "TRIAGE", reportedAt: daysAgo(1) });
    await mk("S-stale", ss.id, {
      state: "IMPORTED",
      reportedAt: daysAgo(50),
      stateEnteredAt: daysAgo(45),
    });

    // The region-less district gets one open ticket.
    await mk("U-open", us.id, { state: "TRIAGE", reportedAt: daysAgo(3) });

    return { north, south, nowhere, ns, ss, us };
  }

  /** Restrict the rollup to this test's own fixture rows. */
  const onlyMine = () => ({
    incidentNumber: { startsWith: `INC${TAG}` },
  });

  async function rollup(extra: Parameters<typeof boroughRollup>[1] = {}) {
    const { north, south, nowhere } = await fixture();
    return boroughRollup(prisma, {
      now,
      scope: onlyMine(),
      districtIds: [north.id, south.id, nowhere.id],
      ...extra,
    });
  }

  const rowFor = (
    report: Awaited<ReturnType<typeof boroughRollup>>,
    borough: string,
  ) => report.rows.find((r) => r.borough === borough);

  it("buckets every ticket into exactly one borough row", async () => {
    const report = await rollup();
    expect(rowFor(report, NORTH)?.openTickets).toBe(2);
    expect(rowFor(report, SOUTH)?.openTickets).toBe(2); // TRIAGE + IMPORTED
    expect(rowFor(report, UNASSIGNED_BOROUGH)?.openTickets).toBe(1);
  });

  it("puts region-less districts in an Unassigned row instead of dropping them", async () => {
    const report = await rollup();
    const unassigned = rowFor(report, UNASSIGNED_BOROUGH);
    expect(unassigned).toBeDefined();
    expect(unassigned!.districts).toBe(1);
    expect(unassigned!.schools).toBe(1);
  });

  it("totals reconcile to the sum of the rows", async () => {
    const report = await rollup();
    const sum = (pick: (r: (typeof report.rows)[number]) => number) =>
      report.rows.reduce((a, r) => a + pick(r), 0);
    expect(report.total.openTickets).toBe(sum((r) => r.openTickets));
    expect(report.total.schools).toBe(sum((r) => r.schools));
    expect(report.total.districts).toBe(sum((r) => r.districts));
    expect(report.total.closedInWindow).toBe(sum((r) => r.closedInWindow));
    expect(report.total.importedBacklog).toBe(sum((r) => r.importedBacklog));
    // And the open total matches a plain count over the same scope.
    expect(report.total.openTickets).toBe(
      await prisma.ticket.count({
        where: andTicketWhere(onlyMine(), { state: { not: "CLOSED" } }),
      }),
    );
  });

  it("counts aging, backlog and closures against the right borough", async () => {
    const report = await rollup();
    // Aging is "open and reported more than 30 days ago", so the
    // 60-day northern ticket and the 50-day southern IMPORTED one
    // both count — aging and the triage backlog deliberately overlap
    // rather than partitioning the work.
    expect(rowFor(report, NORTH)?.aging).toBe(1);
    expect(rowFor(report, SOUTH)?.aging).toBe(1);
    // Only the southern IMPORTED ticket is in the no-triage backlog.
    expect(rowFor(report, SOUTH)?.importedBacklog).toBe(1);
    expect(rowFor(report, NORTH)?.importedBacklog).toBe(0);
    // One northern closure inside the 30-day window, 10-day turnaround.
    expect(rowFor(report, NORTH)?.closedInWindow).toBe(1);
    expect(rowFor(report, NORTH)?.avgTurnaroundDays).toBeCloseTo(10, 1);
    expect(rowFor(report, SOUTH)?.closedInWindow).toBe(0);
    expect(rowFor(report, SOUTH)?.avgTurnaroundDays).toBeNull();
  });

  it("honours the closure window", async () => {
    // The only closure is 5 days old, so a 3-day window excludes it.
    const report = await rollup({ windowDays: 3 });
    expect(report.total.closedInWindow).toBe(0);
    expect(report.total.avgTurnaroundDays).toBeNull();
    // …but the current-state columns are unaffected by the window.
    expect(report.total.openTickets).toBe(5);
  });

  it("district and school counts respect districtIds, not just the ticket scope", async () => {
    // The regression: ticket counts were scoped but the district and
    // school columns were not, so a district-scoped user saw
    // "Southshire — 1 district, 1 school, 0 tickets" for a borough
    // they hold nothing in.
    const { north } = await fixture();
    const report = await boroughRollup(prisma, {
      now,
      scope: andTicketWhere(
        ticketWhereForSession(sessionFor([north.id])),
        onlyMine(),
      ),
      districtIds: [north.id],
    });
    expect(report.rows.map((r) => r.borough)).toEqual([NORTH]);
    expect(report.total.districts).toBe(1);
    expect(report.total.schools).toBe(1);
    expect(report.total.openTickets).toBe(2);
  });

  it("composes with a borough filter without dropping the tenant scope", async () => {
    const { north } = await fixture();
    // Scope says North, filter says South — the honest answer is an
    // empty report, not the southern rows.
    const report = await boroughRollup(prisma, {
      now,
      scope: andTicketWhere(
        ticketWhereForSession(sessionFor([north.id])),
        ticketWhereForBorough(SOUTH),
        onlyMine(),
      ),
      districtIds: [north.id],
    });
    expect(report.total.openTickets).toBe(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("boroughOptions", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("offers a district-scoped user only the boroughs they hold", async () => {
    const districts = await prisma.district.findMany({
      where: { active: true, region: { not: null } },
      select: { id: true, region: true },
    });
    if (districts.length === 0) return;

    const one = districts[0]!;
    const scoped = await boroughOptions(prisma, sessionFor([one.id]));
    expect(scoped).toEqual([one.region!.trim()]);

    // An admin sees every borough in the data.
    const all = await boroughOptions(prisma, sessionFor([], "ADMIN"));
    expect(all.length).toBeGreaterThanOrEqual(scoped.length);
    expect(all).toContain(one.region!.trim());
  });

  it("districtIdsFor is null for admins and the id list otherwise", () => {
    expect(districtIdsFor(sessionFor(["a", "b"], "ADMIN"))).toBeNull();
    expect(districtIdsFor(sessionFor(["a", "b"]))).toEqual(["a", "b"]);
  });
});

describe("normalizeBorough", () => {
  const options = ["Manhattan", "Bronx", "Brooklyn"];

  it("matches case-insensitively and returns the canonical spelling", () => {
    expect(normalizeBorough("bronx", options)).toBe("Bronx");
    expect(normalizeBorough("  BROOKLYN ", options)).toBe("Brooklyn");
  });

  it("falls back to undefined (all boroughs) for anything unrecognised", () => {
    // A stale bookmark must not render an empty report that reads as
    // "no work here".
    expect(normalizeBorough("Atlantis", options)).toBeUndefined();
    expect(normalizeBorough("", options)).toBeUndefined();
    expect(normalizeBorough(undefined, options)).toBeUndefined();
    expect(normalizeBorough(["Bronx"], options)).toBeUndefined();
  });
});

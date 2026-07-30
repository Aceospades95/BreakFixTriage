import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { andTicketWhere } from "@/lib/data/forSession";
import {
  ageDaysWhere,
  agingCutoff,
  closedSinceWhere,
  parseAgeDaysParam,
  parseDateParam,
  stateAgeCutoff,
  stateAgeDaysWhere,
} from "@/lib/reports/age-filter";
import { agingTicketsCount } from "@/lib/reports/dashboards";
import { IMPORTED_BACKLOG_DAYS } from "@/lib/reports/boroughs";

/**
 * The ticket list's age filters.
 *
 * These exist because the dashboards emitted `?ageDays=gte:30` and
 * `?state=IMPORTED` drill-through links that nothing read, so a KPI
 * card said one number and the list one click away said a much larger
 * one. The tests that matter are therefore not "does the helper build
 * a where-clause" but "does the clause actually narrow the rows, to
 * the SAME set the metric counted".
 *
 * DB-backed assertions skip without DATABASE_URL.
 */

describe("age filter parsing", () => {
  it("accepts only the gte:N form the links emit", () => {
    expect(parseAgeDaysParam("gte:30")).toBe(30);
    expect(parseAgeDaysParam(" gte:7 ")).toBe(7);
    expect(parseAgeDaysParam("30")).toBeUndefined();
    expect(parseAgeDaysParam("lte:30")).toBeUndefined();
    expect(parseAgeDaysParam("gte:abc")).toBeUndefined();
    expect(parseAgeDaysParam("gte:-5")).toBeUndefined();
    expect(parseAgeDaysParam(undefined)).toBeUndefined();
  });

  it("returns null clauses for unparseable params so the filter is skipped, not misapplied", () => {
    expect(ageDaysWhere("nonsense")).toBeNull();
    expect(stateAgeDaysWhere("nonsense")).toBeNull();
    expect(closedSinceWhere("nonsense")).toBeNull();
    expect(closedSinceWhere(undefined)).toBeNull();
  });

  it("parses dates and rejects garbage", () => {
    expect(parseDateParam("2026-07-01")?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(parseDateParam("not-a-date")).toBeUndefined();
  });

  it("aging means MORE than N days, state-age means AT LEAST N days", () => {
    // Not a typo — the two metrics this mirrors use different
    // conventions, and the filters have to match their own metric.
    const now = new Date("2026-07-30T00:00:00.000Z");
    expect(agingCutoff(30, now).toISOString()).toBe("2026-06-29T00:00:00.000Z");
    expect(stateAgeCutoff(30, now).toISOString()).toBe(
      "2026-06-30T00:00:00.000Z",
    );
  });

  it("ageDays carries the open predicate, closedSince carries CLOSED", () => {
    // Aging is meaningless for a closed ticket, and a closedAt-only
    // filter would match reopened tickets whose closedAt was never
    // cleared.
    expect(ageDaysWhere("gte:30")).toMatchObject({ state: { not: "CLOSED" } });
    expect(closedSinceWhere("2026-07-01")).toMatchObject({ state: "CLOSED" });
  });
});

const prisma = new PrismaClient();
const TAG = `agf-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("age filters narrow real rows", () => {
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

  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  let fx: Awaited<ReturnType<typeof build>> | null = null;
  async function fixture() {
    if (fx) return fx;
    fx = await build();
    return fx;
  }

  async function build() {
    const district = await prisma.district.create({
      data: { code: `D-${TAG}`, name: `Age ${TAG}`, region: `Ageshire-${TAG}` },
    });
    const school = await prisma.school.create({
      data: { code: `SC-${TAG}`, name: "Age School", districtId: district.id },
    });
    const mk = (key: string, data: Record<string, unknown>) =>
      prisma.ticket.create({
        data: {
          incidentNumber: `INC${TAG}-${key}`,
          schoolId: school.id,
          shortDescription: "age fixture",
          state: "TRIAGE",
          reportedAt: now,
          ...data,
        } as never,
      });

    await mk("fresh", { reportedAt: daysAgo(2) });
    await mk("old", { reportedAt: daysAgo(90) });
    await mk("imported-fresh", {
      state: "IMPORTED",
      reportedAt: daysAgo(3),
      stateEnteredAt: daysAgo(3),
    });
    await mk("imported-stale", {
      state: "IMPORTED",
      reportedAt: daysAgo(90),
      stateEnteredAt: daysAgo(60),
    });
    await mk("closed-recent", {
      state: "CLOSED",
      reportedAt: daysAgo(20),
      closedAt: daysAgo(3),
    });
    await mk("closed-ancient", {
      state: "CLOSED",
      reportedAt: daysAgo(400),
      closedAt: daysAgo(380),
    });
    // The reopened case: closedAt is still set from its first closure
    // because transitionTicket never clears it.
    await mk("reopened", {
      state: "REOPENED",
      reportedAt: daysAgo(40),
      closedAt: daysAgo(5),
    });
    return { district, school };
  }

  const mine = () => ({ incidentNumber: { startsWith: `INC${TAG}` } });
  const count = (clause: object | null) =>
    prisma.ticket.count({ where: andTicketWhere(mine(), clause) });

  it("?ageDays=gte:30 excludes fresh tickets and closed ones", async () => {
    await fixture();
    // Unfiltered: 7 rows. Filtered: only open tickets older than 30d,
    // i.e. INC-old, INC-imported-stale and INC-reopened.
    expect(await count(null)).toBe(7);
    expect(await count(ageDaysWhere("gte:30", now))).toBe(3);
  });

  it("?ageDays agrees with the aging metric it links from", async () => {
    await fixture();
    // The regression this whole helper exists to prevent: the card and
    // the list must return the SAME set.
    const viaFilter = await count(ageDaysWhere("gte:30", now));
    const viaMetric = await agingTicketsCount(
      prisma,
      { thresholdDays: 30, now },
      mine(),
    );
    expect(viaFilter).toBe(viaMetric);
  });

  it("?stateAgeDays narrows IMPORTED to the stalled subset", async () => {
    await fixture();
    const allImported = await count({ state: "IMPORTED" });
    const stalled = await count(
      andTicketWhere(
        { state: "IMPORTED" },
        stateAgeDaysWhere(`gte:${IMPORTED_BACKLOG_DAYS}`, now),
      ),
    );
    expect(allImported).toBe(2);
    expect(stalled).toBe(1);
  });

  it("?closedSince bounds to the window and excludes reopened work", async () => {
    await fixture();
    const since = daysAgo(30).toISOString().slice(0, 10);
    // INC-closed-recent only: the ancient closure is outside the
    // window, and the reopened ticket still carries a closedAt inside
    // it but is not CLOSED.
    const rows = await prisma.ticket.findMany({
      where: andTicketWhere(mine(), closedSinceWhere(since)),
      select: { incidentNumber: true },
    });
    expect(rows.map((r) => r.incidentNumber)).toEqual([
      `INC${TAG}-closed-recent`,
    ]);
  });
});

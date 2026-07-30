import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  andTicketWhere,
  ticketWhereForSession,
} from "@/lib/data/forSession";
import {
  schoolWhereForBorough,
  ticketWhereForBorough,
} from "@/lib/geo/boroughs";
import type { BreakFixSession } from "@/lib/auth/session";

/**
 * Five-borough expansion — the tenant scope and the borough/district
 * filters all constrain the SAME `school` relation. Composing them
 * with a plain object spread keeps only the last one, which in the
 * worst case silently drops the tenant scope and shows a
 * district-scoped user every borough's tickets.
 *
 * These tests run the composed where-clauses against a real database
 * with two districts in different regions, so a regression shows up
 * as wrong ROW COUNTS rather than a passing type-check.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const TAG = `bsc-${Date.now()}`;

function sessionFor(districtIds: string[]): BreakFixSession {
  return {
    userId: "test-user",
    name: "Scoped User",
    email: "scoped@test.local",
    role: "DISPATCHER",
    districtIds,
  } as BreakFixSession;
}

describe.skipIf(!process.env.DATABASE_URL)("borough scoping", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${TAG}` } },
    });
    await prisma.school.deleteMany({ where: { code: { startsWith: `SC-${TAG}` } } });
    await prisma.district.deleteMany({ where: { code: { startsWith: `D-${TAG}` } } });
    await prisma.$disconnect();
  });

  // Created once and reused — the same codes cannot be inserted twice.
  let fx: Awaited<ReturnType<typeof buildFixture>> | null = null;
  async function fixture() {
    if (fx) return fx;
    fx = await buildFixture();
    return fx;
  }

  async function buildFixture() {
    const north = await prisma.district.create({
      data: { code: `D-${TAG}-N`, name: `North ${TAG}`, region: `Northshire-${TAG}` },
    });
    const south = await prisma.district.create({
      data: { code: `D-${TAG}-S`, name: `South ${TAG}`, region: `Southshire-${TAG}` },
    });
    const ns = await prisma.school.create({
      data: { code: `SC-${TAG}-N`, name: `North School ${TAG}`, districtId: north.id },
    });
    const ss = await prisma.school.create({
      data: { code: `SC-${TAG}-S`, name: `South School ${TAG}`, districtId: south.id },
    });
    // 3 north, 2 south.
    for (let i = 0; i < 3; i++) {
      await prisma.ticket.create({
        data: {
          incidentNumber: `INC${TAG}-N${i}`,
          schoolId: ns.id,
          shortDescription: "north fixture",
          state: "TRIAGE",
          reportedAt: new Date(),
        },
      });
    }
    for (let i = 0; i < 2; i++) {
      await prisma.ticket.create({
        data: {
          incidentNumber: `INC${TAG}-S${i}`,
          schoolId: ss.id,
          shortDescription: "south fixture",
          state: "TRIAGE",
          reportedAt: new Date(),
        },
      });
    }
    return { north, south, ns, ss };
  }

  const mine = (extra: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput => ({
    AND: [{ incidentNumber: { startsWith: `INC${TAG}` } }, extra],
  });

  it("a district-scoped session sees only its own district's tickets", async () => {
    const { north } = await fixture();
    const where = andTicketWhere(
      ticketWhereForSession(sessionFor([north.id])),
      mine(),
    );
    const rows = await prisma.ticket.findMany({
      where,
      select: { incidentNumber: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.incidentNumber.includes("-N"))).toBe(true);
  });

  it("an admin (empty scope) sees both districts", async () => {
    const where = andTicketWhere(
      ticketWhereForSession({
        userId: "a",
        name: "A",
        email: "a@t.local",
        role: "ADMIN",
        districtIds: [],
      } as BreakFixSession),
      mine(),
    );
    expect(await prisma.ticket.count({ where })).toBe(5);
  });

  it("the borough filter narrows to one region", async () => {
    const where = andTicketWhere(
      ticketWhereForBorough(`Southshire-${TAG}`),
      mine(),
    );
    const rows = await prisma.ticket.findMany({
      where,
      select: { incidentNumber: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.incidentNumber.includes("-S"))).toBe(true);
  });

  it("tenant scope SURVIVES being combined with a borough filter", async () => {
    // The regression this whole file exists for: scope says North,
    // the borough filter says South. Both own `school`; a spread
    // would drop the scope and leak the 2 southern tickets. The
    // correct answer is zero rows.
    const { north } = await fixture();
    const leaky: Prisma.TicketWhereInput = {
      ...ticketWhereForSession(sessionFor([north.id])),
      ...ticketWhereForBorough(`Southshire-${TAG}`),
    };
    const leakyCount = await prisma.ticket.count({ where: mine(leaky) });
    const safeCount = await prisma.ticket.count({
      where: andTicketWhere(
        ticketWhereForSession(sessionFor([north.id])),
        ticketWhereForBorough(`Southshire-${TAG}`),
        mine(),
      ),
    });
    // Proof the naive spread really does leak, and that the composer
    // does not.
    expect(leakyCount).toBeGreaterThan(0);
    expect(safeCount).toBe(0);
  });

  it("school-level borough filter matches the ticket-level one", async () => {
    const { south } = await fixture();
    const schools = await prisma.school.findMany({
      where: {
        AND: [
          { code: { startsWith: `SC-${TAG}` } },
          schoolWhereForBorough(`Southshire-${TAG}`),
        ],
      },
      select: { districtId: true },
    });
    expect(schools.length).toBeGreaterThan(0);
    expect(schools.every((s) => s.districtId === south.id)).toBe(true);
  });
});

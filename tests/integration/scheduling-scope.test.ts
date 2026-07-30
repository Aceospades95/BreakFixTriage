import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  andJobWhere,
  andTicketWhere,
  jobWhereForSession,
  schoolWhereForSession,
  ticketWhereForSession,
} from "@/lib/data/forSession";
import { jobWhereForBorough } from "@/lib/geo/boroughs";
import type { BreakFixSession } from "@/lib/auth/session";

/**
 * Scheduling tenant scope.
 *
 * The route builder listed every UNSCHEDULED job in the system with
 * no scope, and neither previewRouteAction nor buildRouteAction
 * checked that the posted job ids belonged to the actor — so a
 * district-scoped dispatcher could stage and route another borough's
 * work by posting ids. The UI filter was never the control; these
 * tests pin the query-level control that is.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const TAG = `sch-${Date.now()}`;

function sessionFor(
  districtIds: string[],
  role: BreakFixSession["role"] = "DISPATCHER",
): BreakFixSession {
  return {
    userId: "test-user",
    name: "Scoped",
    email: "scoped@test.local",
    role,
    districtIds,
  } as BreakFixSession;
}

describe.skipIf(!process.env.DATABASE_URL)("scheduling tenant scope", () => {
  afterAll(async () => {
    await prisma.job.deleteMany({
      where: { school: { code: { startsWith: `SC-${TAG}` } } },
    });
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

  let fx: Awaited<ReturnType<typeof build>> | null = null;
  async function fixture() {
    if (fx) return fx;
    fx = await build();
    return fx;
  }

  async function build() {
    const north = await prisma.district.create({
      data: { code: `D-${TAG}-N`, name: `N ${TAG}`, region: `Northshire-${TAG}` },
    });
    const south = await prisma.district.create({
      data: { code: `D-${TAG}-S`, name: `S ${TAG}`, region: `Southshire-${TAG}` },
    });
    const ns = await prisma.school.create({
      data: { code: `SC-${TAG}-N`, name: "N School", districtId: north.id },
    });
    const ss = await prisma.school.create({
      data: { code: `SC-${TAG}-S`, name: "S School", districtId: south.id },
    });
    const njob = await prisma.job.create({
      data: { type: "PICKUP", status: "UNSCHEDULED", schoolId: ns.id },
    });
    const sjob = await prisma.job.create({
      data: { type: "PICKUP", status: "UNSCHEDULED", schoolId: ss.id },
    });
    const sticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${TAG}-S`,
        schoolId: ss.id,
        shortDescription: "southern",
        state: "AWAITING_PICKUP",
        reportedAt: new Date(),
      },
    });
    return { north, south, ns, ss, njob, sjob, sticket };
  }

  it("a district-scoped session sees only its own district's jobs", async () => {
    const { north, njob } = await fixture();
    const jobs = await prisma.job.findMany({
      where: andJobWhere(jobWhereForSession(sessionFor([north.id])), {
        school: { code: { startsWith: `SC-${TAG}` } },
      }),
      select: { id: true },
    });
    expect(jobs.map((j) => j.id)).toEqual([njob.id]);
  });

  it("an admin sees both districts' jobs", async () => {
    await fixture();
    const jobs = await prisma.job.findMany({
      where: andJobWhere(jobWhereForSession(sessionFor([], "ADMIN")), {
        school: { code: { startsWith: `SC-${TAG}` } },
      }),
      select: { id: true },
    });
    expect(jobs).toHaveLength(2);
  });

  it("posting another district's job id resolves to nothing", async () => {
    // This is the buildRouteAction guard: the count of resolvable
    // jobs must not equal the count posted, so the build is refused.
    const { north, sjob, njob } = await fixture();
    const posted = [njob.id, sjob.id];
    const visible = await prisma.job.findMany({
      where: andJobWhere(jobWhereForSession(sessionFor([north.id])), {
        id: { in: posted },
      }),
      select: { id: true },
    });
    expect(visible).toHaveLength(1);
    expect(visible.length).not.toBe(posted.length);
  });

  it("the job borough filter composes without dropping the tenant scope", async () => {
    const { north } = await fixture();
    // Scope says North, filter says South — the honest answer is zero,
    // not the southern job.
    const leaky = {
      ...jobWhereForSession(sessionFor([north.id])),
      ...jobWhereForBorough(`Southshire-${TAG}`),
    };
    const leakyCount = await prisma.job.count({
      where: { AND: [leaky, { school: { code: { startsWith: `SC-${TAG}` } } }] },
    });
    const safeCount = await prisma.job.count({
      where: andJobWhere(
        jobWhereForSession(sessionFor([north.id])),
        jobWhereForBorough(`Southshire-${TAG}`),
        { school: { code: { startsWith: `SC-${TAG}` } } },
      ),
    });
    expect(leakyCount).toBeGreaterThan(0); // the spread really does leak
    expect(safeCount).toBe(0);
  });

  it("createJobAction's guards reject a cross-district school and ticket", async () => {
    const { north, ss, sticket } = await fixture();
    const session = sessionFor([north.id]);

    // School guard.
    const school = await prisma.school.findFirst({
      where: { AND: [schoolWhereForSession(session), { id: ss.id }] },
      select: { id: true },
    });
    expect(school).toBeNull();

    // Ticket guard.
    const visible = await prisma.ticket.count({
      where: andTicketWhere(ticketWhereForSession(session), {
        id: { in: [sticket.id] },
      }),
    });
    expect(visible).toBe(0);
  });
});

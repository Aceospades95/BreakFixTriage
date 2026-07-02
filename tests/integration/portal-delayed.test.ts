import { afterAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, RouteStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { updateStopStatus } from "@/lib/scheduling/stops";
import { delayedTicketWhere } from "@/lib/portal/delayed";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-22 (demo decision) — the school portal's "Delayed" bucket:
 * a ticket whose pickup stop FAILED counts as delayed while it waits
 * for a new visit, and drops out once the rescheduled visit succeeds.
 *
 * Skipped without DATABASE_URL.
 */

const RUN_TAG = `pdel-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("portal delayed bucket", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("failed stop → delayed; completed visit → drops out", async () => {
    const district = await ensureIntegrationDistrict(prisma);
    const school = await prisma.school.upsert({
      where: { code: "IT-SCH-PDEL" },
      create: {
        code: "IT-SCH-PDEL",
        name: "Portal Delay School",
        districtId: district.id,
      },
      update: {},
    });
    const driver = await prisma.user.upsert({
      where: { email: "pdel-driver@integration.test" },
      create: {
        email: "pdel-driver@integration.test",
        name: "PDEL Driver",
        role: "DRIVER",
      },
      update: {},
    });
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 7)}`,
        shortDescription: "portal delayed fixture",
        state: "PICKUP_SCHEDULED",
        schoolId: school.id,
        reportedAt: new Date(),
      },
    });
    const job = await prisma.job.create({
      data: {
        type: JobType.PICKUP,
        schoolId: school.id,
        status: JobStatus.SCHEDULED,
        ticketLinks: { create: { ticketId: ticket.id } },
      },
    });
    const route = await prisma.route.create({
      data: {
        date: new Date(),
        assigneeUserId: driver.id,
        status: RouteStatus.PLANNED,
        stops: {
          create: {
            jobId: job.id,
            sequence: 1,
            status: JobStatus.SCHEDULED,
            proofRule: "NONE",
          },
        },
      },
      include: { stops: true },
    });
    const stop = route.stops[0]!;

    const countDelayed = () =>
      prisma.ticket.count({
        where: {
          ...delayedTicketWhere(school.id),
          id: ticket.id,
        },
      });

    // Scheduled, nothing wrong yet → not delayed.
    expect(await countDelayed()).toBe(0);

    // Stop fails (school closed) → ticket re-queues AND counts delayed.
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.FAILED,
      actorUserId: driver.id,
      reason: "School closed",
    });
    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(after.state).toBe("AWAITING_PICKUP");
    expect(await countDelayed()).toBe(1);

    // The rescheduled visit succeeds → ticket moves to IN_WAREHOUSE and
    // leaves the delayed bucket (it's no longer waiting on a visit).
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { state: "IN_WAREHOUSE" },
    });
    expect(await countDelayed()).toBe(0);

    // Cross-phase regression: months later the same ticket waits on
    // its DELIVERY. The old FAILED pickup stop must not re-flag it —
    // that failure was resolved by the successful re-pickup.
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { state: "PENDING_DELIVERY" },
    });
    expect(await countDelayed()).toBe(0);

    // But a troubled DELIVERY stop does flag it while it waits.
    const deliveryJob = await prisma.job.create({
      data: {
        type: JobType.DELIVERY,
        schoolId: school.id,
        status: JobStatus.SCHEDULED,
        ticketLinks: { create: { ticketId: ticket.id } },
      },
    });
    await prisma.route.create({
      data: {
        date: new Date(),
        assigneeUserId: driver.id,
        status: RouteStatus.PLANNED,
        stops: {
          create: {
            jobId: deliveryJob.id,
            sequence: 1,
            status: JobStatus.FAILED,
            proofRule: "NONE",
          },
        },
      },
    });
    expect(await countDelayed()).toBe(1);
  });
});

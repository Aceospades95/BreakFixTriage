import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, PrismaClient, RouteStatus } from "@prisma/client";
import { updateStopStatus } from "@/lib/scheduling/stops";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-21 — failing a stop stamps the driver's reason onto the
 * RouteStop row (RouteStop.failureReason) so dispatch can triage
 * reschedules from the stop card, and the linked ticket falls back
 * to the reschedule queue (AWAITING_PICKUP) with the reason in its
 * event trail.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();

const RUN_TAG = `sfr-${Date.now()}`;

async function createFixture() {
  const district = await ensureIntegrationDistrict(prisma);
  const school = await prisma.school.upsert({
    where: { code: "IT-SCH-SFR" },
    create: {
      code: "IT-SCH-SFR",
      name: "Failure Reason School",
      districtId: district.id,
    },
    update: {},
  });
  const driver = await prisma.user.upsert({
    where: { email: "sfr-driver@integration.test" },
    create: {
      email: "sfr-driver@integration.test",
      name: "SFR Driver",
      role: "DRIVER",
    },
    update: {},
  });
  const ticket = await prisma.ticket.create({
    data: {
      incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 8)}`,
      shortDescription: "failure-reason fixture",
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
        create: { jobId: job.id, sequence: 1, status: JobStatus.SCHEDULED },
      },
    },
    include: { stops: true },
  });
  return { ticket, stop: route.stops[0]!, driver };
}

describe.skipIf(!process.env.DATABASE_URL)("stop failure reason", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("FAILED stamps failureReason on the stop and reverts the ticket", async () => {
    const { ticket, stop, driver } = await createFixture();

    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.FAILED,
      actorUserId: driver.id,
      reason: "Device not found — reschedule required",
    });

    const after = await prisma.routeStop.findUniqueOrThrow({
      where: { id: stop.id },
    });
    expect(after.status).toBe(JobStatus.FAILED);
    expect(after.failureReason).toBe("Device not found — reschedule required");

    // The pickup cascade puts the ticket back in the reschedule queue.
    const t = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(t.state).toBe("AWAITING_PICKUP");
  });

  it("non-FAILED transitions leave failureReason untouched", async () => {
    const { stop, driver } = await createFixture();

    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.EN_ROUTE,
      actorUserId: driver.id,
    });

    const after = await prisma.routeStop.findUniqueOrThrow({
      where: { id: stop.id },
    });
    expect(after.status).toBe(JobStatus.EN_ROUTE);
    expect(after.failureReason).toBeNull();
  });
});

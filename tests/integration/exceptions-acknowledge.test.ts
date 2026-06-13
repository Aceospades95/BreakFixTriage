import { afterAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, RouteStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { updateStopStatus } from "@/lib/scheduling/stops";
import { getExceptionCounts, FIELD_OUTCOME_WHERE } from "@/lib/exceptions/counts";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-22 §2 — a failed stop becomes an actionable field-outcome
 * exception, and acknowledging it removes it from the active count.
 *
 * Skipped without DATABASE_URL.
 */

const RUN_TAG = `exa-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("field-outcome exceptions", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("a failed stop counts as a field outcome and clears on acknowledge", async () => {
    const district = await ensureIntegrationDistrict(prisma);
    const school = await prisma.school.upsert({
      where: { code: "IT-SCH-EXA" },
      create: { code: "IT-SCH-EXA", name: "Exceptions School", districtId: district.id },
      update: {},
    });
    const driver = await prisma.user.upsert({
      where: { email: "exa-driver@integration.test" },
      create: { email: "exa-driver@integration.test", name: "EXA Driver", role: "DRIVER" },
      update: {},
    });
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 7)}`,
        shortDescription: "exception fixture",
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
        stops: { create: { jobId: job.id, sequence: 1, status: JobStatus.SCHEDULED } },
      },
      include: { stops: true },
    });
    const stop = route.stops[0]!;

    const before = await getExceptionCounts();
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.FAILED,
      actorUserId: driver.id,
      reason: "School closed",
    });
    const after = await getExceptionCounts();
    expect(after.fieldOutcomes).toBe(before.fieldOutcomes + 1);

    // The warn audit row for this stop exists and is unacknowledged.
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { ...FIELD_OUTCOME_WHERE, entityId: stop.id },
    });

    // Acknowledge it (what acknowledgeExceptionAction does).
    await prisma.auditLog.update({
      where: { id: row.id },
      data: { acknowledgedAt: new Date(), acknowledgedByUserId: driver.id },
    });

    const acked = await getExceptionCounts();
    expect(acked.fieldOutcomes).toBe(before.fieldOutcomes);
  });
});

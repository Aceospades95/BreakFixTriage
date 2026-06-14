import { afterAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, RouteStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  StopUpdateRefusedError,
  updateStopStatus,
} from "@/lib/scheduling/stops";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-22 §1C/§1D — per-line verification + the partial split.
 *
 * A delivery stop with two device lines: verify one, mark the other not
 * found. The stop saves as PARTIAL; the verified ticket cascades forward
 * (RETURNED) and the not-found ticket re-queues (PENDING_DELIVERY) for
 * rescheduling. Also pins the on-site ordering gate (Complete requires
 * ARRIVED) and the proof override path.
 *
 * Skipped without DATABASE_URL.
 */

const RUN_TAG = `sli-${Date.now()}`;

async function deliveryFixture() {
  const district = await ensureIntegrationDistrict(prisma);
  const school = await prisma.school.upsert({
    where: { code: "IT-SCH-SLI" },
    create: { code: "IT-SCH-SLI", name: "Line Items School", districtId: district.id },
    update: {},
  });
  const driver = await prisma.user.upsert({
    where: { email: "sli-driver@integration.test" },
    create: { email: "sli-driver@integration.test", name: "SLI Driver", role: "DRIVER" },
    update: {},
  });
  async function mkTicketWithDevice(n: number) {
    const device = await prisma.device.create({
      data: { serialNumber: `SLI-${RUN_TAG}-${n}-${Math.random().toString(36).slice(2, 7)}` },
    });
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-${n}-${Math.random().toString(36).slice(2, 6)}`,
        shortDescription: `line item ${n}`,
        state: "DELIVERY_SCHEDULED",
        schoolId: school.id,
        deviceId: device.id,
        reportedAt: new Date(),
      },
    });
    return { ticket, device };
  }
  const a = await mkTicketWithDevice(1);
  const b = await mkTicketWithDevice(2);
  const job = await prisma.job.create({
    data: {
      type: JobType.DELIVERY,
      schoolId: school.id,
      status: JobStatus.SCHEDULED,
      ticketLinks: { create: [{ ticketId: a.ticket.id }, { ticketId: b.ticket.id }] },
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
  // Pre-populate the two expected line items (buildRoute does this for
  // real routes; the test creates the route directly).
  const lineA = await prisma.stopDevice.create({
    data: { stopId: stop.id, ticketId: a.ticket.id, deviceId: a.device.id, purpose: "DELIVERY", addedByUserId: driver.id },
  });
  const lineB = await prisma.stopDevice.create({
    data: { stopId: stop.id, ticketId: b.ticket.id, deviceId: b.device.id, purpose: "DELIVERY", addedByUserId: driver.id },
  });
  return { driver, stop, a, b, lineA, lineB };
}

describe.skipIf(!process.env.DATABASE_URL)("stop line items (Round-22)", () => {
  afterAll(async () => {
    await prisma.stopDevice.deleteMany({
      where: { device: { serialNumber: { startsWith: `SLI-${RUN_TAG}` } } },
    });
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.device.deleteMany({
      where: { serialNumber: { startsWith: `SLI-${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("Complete is refused before the tech is on site", async () => {
    const { driver, stop } = await deliveryFixture();
    await updateStopStatus({ stopId: stop.id, status: JobStatus.EN_ROUTE, actorUserId: driver.id });
    await expect(
      updateStopStatus({
        stopId: stop.id,
        status: JobStatus.COMPLETED,
        actorUserId: driver.id,
      }),
    ).rejects.toThrow(StopUpdateRefusedError);
  });

  it("PARTIAL verifies one line, re-queues the other", async () => {
    const { driver, stop, a, b, lineA, lineB } = await deliveryFixture();
    await updateStopStatus({ stopId: stop.id, status: JobStatus.EN_ROUTE, actorUserId: driver.id });
    await updateStopStatus({ stopId: stop.id, status: JobStatus.ARRIVED, actorUserId: driver.id });

    // Completing with a not-found line must be refused (use Partial).
    await expect(
      updateStopStatus({
        stopId: stop.id,
        status: JobStatus.COMPLETED,
        actorUserId: driver.id,
        lineResolutions: [
          { stopDeviceId: lineA.id, state: "VERIFIED" },
          { stopDeviceId: lineB.id, state: "NOT_FOUND", note: "Not at the office" },
        ],
      }),
    ).rejects.toThrow(StopUpdateRefusedError);

    // Partial succeeds.
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.PARTIAL,
      actorUserId: driver.id,
      lineResolutions: [
        { stopDeviceId: lineA.id, state: "VERIFIED" },
        { stopDeviceId: lineB.id, state: "NOT_FOUND", note: "Not at the office" },
      ],
    });

    const after = await prisma.routeStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(after.status).toBe(JobStatus.PARTIAL);

    // Verified delivery → RETURNED; not-found → back to PENDING_DELIVERY.
    const ta = await prisma.ticket.findUniqueOrThrow({ where: { id: a.ticket.id } });
    const tb = await prisma.ticket.findUniqueOrThrow({ where: { id: b.ticket.id } });
    expect(ta.state).toBe("RETURNED");
    expect(tb.state).toBe("PENDING_DELIVERY");

    // The not-found line carries its note + state.
    const lb = await prisma.stopDevice.findUniqueOrThrow({ where: { id: lineB.id } });
    expect(lb.lineState).toBe("NOT_FOUND");
    expect(lb.lineNote).toBe("Not at the office");

    // The partial wrote a high-visibility (warn) audit row.
    const warn = await prisma.auditLog.findFirst({
      where: { entityType: "RouteStop", entityId: stop.id, severity: "warn" },
    });
    expect(warn).not.toBeNull();
  });

  it("a proof override is required + recorded when proof is unmet", async () => {
    const { driver, stop, lineA, lineB } = await deliveryFixture();
    // Force a proof rule so the gate demands proof.
    await prisma.routeStop.update({
      where: { id: stop.id },
      data: { proofRule: "PHOTO_AND_SIGNATURE" },
    });
    await updateStopStatus({ stopId: stop.id, status: JobStatus.EN_ROUTE, actorUserId: driver.id });
    await updateStopStatus({ stopId: stop.id, status: JobStatus.ARRIVED, actorUserId: driver.id });

    // No proof, no override → refused.
    await expect(
      updateStopStatus({
        stopId: stop.id,
        status: JobStatus.COMPLETED,
        actorUserId: driver.id,
        lineResolutions: [
          { stopDeviceId: lineA.id, state: "VERIFIED" },
          { stopDeviceId: lineB.id, state: "VERIFIED" },
        ],
      }),
    ).rejects.toThrow(StopUpdateRefusedError);

    // With an override reason → completes, flagged on the record.
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.COMPLETED,
      actorUserId: driver.id,
      proofOverrideReason: "Front office closed; left with security and logged it",
      lineResolutions: [
        { stopDeviceId: lineA.id, state: "VERIFIED" },
        { stopDeviceId: lineB.id, state: "VERIFIED" },
      ],
    });
    const after = await prisma.routeStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(after.status).toBe(JobStatus.COMPLETED);
    expect(after.proofOverrideReason).toContain("Front office closed");
    expect(after.proofOverrideByUserId).toBe(driver.id);
  });
});

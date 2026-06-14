import { afterAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, RouteStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { updateStopStatus } from "@/lib/scheduling/stops";
import { buildSiteSummary, periodWindow } from "@/lib/reports/site-summary";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-22 §4 — the per-site summary counts routes run, failed/partial
 * stops with reasons, and pending devices for one school over a period.
 *
 * Skipped without DATABASE_URL.
 */

const RUN_TAG = `ssum-${Date.now()}`;

describe("periodWindow", () => {
  it("week is 7 days, month is 30", () => {
    const now = new Date("2026-06-13T12:00:00Z");
    const w = periodWindow("week", now);
    const m = periodWindow("month", now);
    expect(Math.round((w.to.getTime() - w.from.getTime()) / 86400000)).toBe(7);
    expect(Math.round((m.to.getTime() - m.from.getTime()) / 86400000)).toBe(30);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("buildSiteSummary", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("counts routes run, a failed stop with its reason, and pending devices", async () => {
    const district = await ensureIntegrationDistrict(prisma);
    const school = await prisma.school.upsert({
      where: { code: "IT-SCH-SSUM" },
      create: { code: "IT-SCH-SSUM", name: "Summary School", districtId: district.id },
      update: {},
    });
    const driver = await prisma.user.upsert({
      where: { email: "ssum-driver@integration.test" },
      create: { email: "ssum-driver@integration.test", name: "SSUM Driver", role: "DRIVER" },
      update: {},
    });
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 7)}`,
        shortDescription: "summary fixture",
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
          create: { jobId: job.id, sequence: 1, status: JobStatus.SCHEDULED, proofRule: "NONE" },
        },
      },
      include: { stops: true },
    });

    await updateStopStatus({
      stopId: route.stops[0]!.id,
      status: JobStatus.FAILED,
      actorUserId: driver.id,
      reason: "School closed",
    });

    const after = await buildSiteSummary(school.id, "week");
    expect(after).not.toBeNull();
    // The route we built this run is counted (failing a stop doesn't add
    // or remove a route).
    expect(after!.routesRun).toBeGreaterThanOrEqual(1);
    expect(after!.failedStops.length).toBeGreaterThanOrEqual(1);
    expect(after!.failedStops.some((f) => f.reason === "School closed")).toBe(true);
    // The failed pickup put the ticket back to AWAITING_PICKUP — still pending.
    expect(after!.devicesPending).toBeGreaterThanOrEqual(1);
    // The failed stop is an open exception for this school.
    expect(after!.openExceptions).toBeGreaterThanOrEqual(1);
  });
});

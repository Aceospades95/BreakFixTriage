import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { duplicateQueueCounts } from "@/lib/duplicates/counts";
import { duplicateQueueCount } from "@/lib/reports/dashboards";
import { getExceptionCounts } from "@/lib/exceptions/counts";
import { createPortalToken } from "@/lib/portal/tokens";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * QA audit (July 2026) — the monitoring layer must agree with the
 * queues it monitors.
 *
 * BUG-1: an unlinked synthetic sat on /duplicates for 58 days while
 * the dashboard tile and the exceptions monitor both read 0. All
 * three surfaces now derive from duplicateQueueCounts().
 *
 * BUG-2: already-expired portal tokens were listed under "expiring
 * within 30 days". Expired and expiring-soon are separate buckets.
 *
 * BUG-5: tickets stuck in IMPORTED for 30+ days get their own
 * exception bucket instead of blending into generic aging.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const RUN_TAG = `exc-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("exception counts", () => {
  afterAll(async () => {
    await prisma.duplicateConflict.deleteMany({
      where: { notes: { contains: RUN_TAG } },
    });
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `SYN${RUN_TAG}` } },
    });
    await prisma.portalToken.deleteMany({
      where: { label: { startsWith: RUN_TAG } },
    });
    await prisma.$disconnect();
  });

  async function fixtureSchool() {
    const district = await ensureIntegrationDistrict(prisma);
    return prisma.school.upsert({
      where: { code: "IT-SCH-EXC" },
      create: {
        code: "IT-SCH-EXC",
        name: "Exception Counts School",
        districtId: district.id,
      },
      update: {},
    });
  }

  it("dashboard tile, exceptions monitor, and /duplicates definition agree (BUG-1)", async () => {
    const school = await fixtureSchool();
    const before = await duplicateQueueCounts(prisma);

    // One unresolved conflict pair + one unlinked synthetic — the
    // two work-item kinds the /duplicates page lists.
    const left = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-L`,
        shortDescription: "exc fixture left",
        state: "TRIAGE",
        schoolId: school.id,
        reportedAt: new Date(),
      },
    });
    const right = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-R`,
        shortDescription: "exc fixture right",
        state: "IMPORTED",
        schoolId: school.id,
        reportedAt: new Date(),
      },
    });
    await prisma.duplicateConflict.create({
      data: {
        kind: "SERIAL",
        leftTicketId: left.id,
        rightTicketId: right.id,
        notes: `integration fixture ${RUN_TAG}`,
      },
    });
    await prisma.ticket.create({
      data: {
        incidentNumber: `SYN${RUN_TAG}-1`,
        shortDescription: "exc fixture synthetic",
        state: "PENDING_PICKUP_UNLINKED",
        schoolId: school.id,
        reportedAt: new Date(),
      },
    });

    const after = await duplicateQueueCounts(prisma);
    expect(after.unresolvedConflicts).toBe(before.unresolvedConflicts + 1);
    expect(after.unlinkedSynthetics).toBe(before.unlinkedSynthetics + 1);
    expect(after.total).toBe(before.total + 2);

    // Every surface reports the SAME number.
    const dashboardTile = await duplicateQueueCount(prisma);
    const exceptions = await getExceptionCounts(prisma);
    expect(dashboardTile).toBe(after.total);
    expect(exceptions.duplicateQueue).toBe(after.total);
  });

  it("expired and expiring-soon tokens land in separate buckets (BUG-2)", async () => {
    const school = await fixtureSchool();
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
    });
    const day = 24 * 60 * 60 * 1000;
    const before = await getExceptionCounts(prisma);

    await createPortalToken(
      {
        schoolId: school.id,
        label: `${RUN_TAG}-expired`,
        expiresAt: new Date(Date.now() - 5 * day),
        actorUserId: admin.id,
      },
      prisma,
    );
    await createPortalToken(
      {
        schoolId: school.id,
        label: `${RUN_TAG}-soon`,
        expiresAt: new Date(Date.now() + 5 * day),
        actorUserId: admin.id,
      },
      prisma,
    );

    const after = await getExceptionCounts(prisma);
    expect(after.expiredTokens).toBe(before.expiredTokens + 1);
    expect(after.expiringTokens).toBe(before.expiringTokens + 1);
  });

  it("tickets stuck in IMPORTED 30+ days count toward the backlog bucket (BUG-5)", async () => {
    const school = await fixtureSchool();
    const day = 24 * 60 * 60 * 1000;
    const before = await getExceptionCounts(prisma);

    // 45 days in IMPORTED → counts. 5 days → does not.
    await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-OLD`,
        shortDescription: "exc fixture stale import",
        state: "IMPORTED",
        schoolId: school.id,
        reportedAt: new Date(Date.now() - 45 * day),
        stateEnteredAt: new Date(Date.now() - 45 * day),
      },
    });
    await prisma.ticket.create({
      data: {
        incidentNumber: `INC${RUN_TAG}-NEW`,
        shortDescription: "exc fixture fresh import",
        state: "IMPORTED",
        schoolId: school.id,
        reportedAt: new Date(Date.now() - 5 * day),
        stateEnteredAt: new Date(Date.now() - 5 * day),
      },
    });

    const after = await getExceptionCounts(prisma);
    expect(after.importedBacklog).toBe(before.importedBacklog + 1);
  });
});

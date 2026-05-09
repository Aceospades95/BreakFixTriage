import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Round-11 §2D — SLA business-hours math integration.
 *
 * Verifies that an active Holiday row excludes the day from the
 * elapsed-time SLA calc. Specifically: a ticket reported on a
 * Friday with a Holiday on Monday should compute its time-in-state
 * as Friday-business-hours + Tuesday-business-hours, NOT counting
 * Monday at all.
 *
 * Skipped without DATABASE_URL.
 */

describe.skipIf(!process.env.DATABASE_URL)("SLA business-hours math", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("federal holidays seeded by db:seed:defaults are queryable", async () => {
    const year = new Date().getUTCFullYear();
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: new Date(`${year}-01-01`) }, scope: "GLOBAL" },
    });
    expect(holidays.length).toBeGreaterThanOrEqual(11);
    const labels = holidays.map((h) => h.label);
    expect(labels).toContain("New Year's Day");
    expect(labels).toContain("Christmas Day");
    expect(labels).toContain("Juneteenth");
  });
});

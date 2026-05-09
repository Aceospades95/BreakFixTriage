import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedDefaults } from "../../prisma/seed-defaults";

/**
 * Round-12 §1A — auto-seed idempotency integration test.
 *
 * Skipped without DATABASE_URL. CI provisions Postgres + runs
 * `prisma migrate deploy` before this suite fires.
 *
 * The brief asked for in-memory SQLite, but our schema uses
 * Postgres-only types (Json, String[], DateTime[]) so a Postgres
 * test is required. Documented in docs/round-12-assumptions.md.
 */

describe.skipIf(!process.env.DATABASE_URL)(
  "seed-defaults idempotency",
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("first run inserts the documented row counts", async () => {
      const r = await seedDefaults(prisma);
      expect(r.templatesUpserted).toBeGreaterThanOrEqual(8);
      expect(r.year).toBe(new Date().getUTCFullYear());

      const ruleCount = await prisma.emailRule.count({
        where: { scope: "GLOBAL", event: "ticket_created" },
      });
      expect(ruleCount).toBeGreaterThanOrEqual(1);

      const tplCount = await prisma.emailTemplate.count();
      expect(tplCount).toBeGreaterThanOrEqual(8);

      const holCount = await prisma.holiday.count({
        where: {
          scope: "GLOBAL",
          date: {
            gte: new Date(`${r.year}-01-01`),
            lt: new Date(`${r.year + 3}-01-01`),
          },
        },
      });
      expect(
        holCount,
        "expect 33 holiday rows across current year + 2 future years",
      ).toBeGreaterThanOrEqual(33);
    });

    it("second run does not duplicate rows", async () => {
      const beforeTpl = await prisma.emailTemplate.count();
      const beforeRule = await prisma.emailRule.count({
        where: { scope: "GLOBAL", event: "ticket_created" },
      });
      const beforeHol = await prisma.holiday.count({ where: { scope: "GLOBAL" } });

      const r2 = await seedDefaults(prisma);
      expect(r2.holidaysCreated).toBe(0);
      expect(r2.ruleCreated).toBe(false);

      expect(await prisma.emailTemplate.count()).toBe(beforeTpl);
      expect(
        await prisma.emailRule.count({
          where: { scope: "GLOBAL", event: "ticket_created" },
        }),
      ).toBe(beforeRule);
      expect(await prisma.holiday.count({ where: { scope: "GLOBAL" } })).toBe(
        beforeHol,
      );
    });

    it("every seeded row has a matching system_seed audit row", async () => {
      const tpls = await prisma.emailTemplate.findMany({ select: { id: true } });
      for (const t of tpls) {
        const audit = await prisma.auditLog.findFirst({
          where: { entityType: "EmailTemplate", entityId: t.id, action: "system_seed" },
        });
        expect(audit, `EmailTemplate ${t.id} has no system_seed audit`).not.toBeNull();
      }

      const rules = await prisma.emailRule.findMany({
        where: { scope: "GLOBAL", event: "ticket_created" },
        select: { id: true },
      });
      for (const r of rules) {
        const audit = await prisma.auditLog.findFirst({
          where: { entityType: "EmailRule", entityId: r.id, action: "system_seed" },
        });
        expect(audit, `EmailRule ${r.id} has no system_seed audit`).not.toBeNull();
      }
    });
  },
);

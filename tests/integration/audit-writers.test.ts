import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { writeAudit } from "../../src/lib/audit/audit";

/**
 * Round-11 §2D — audit writer integration test.
 *
 * Verifies that writeAudit() persists with the documented shape
 * (actorUserId, entityType, entityId, action, before/after JSON).
 * Skipped without DATABASE_URL.
 */

describe.skipIf(!process.env.DATABASE_URL)("audit writers", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const u = await prisma.user.upsert({
      where: { email: "audit-test@example.test" },
      create: {
        email: "audit-test@example.test",
        name: "Audit Test",
        role: "ADMIN",
        passwordHash: "x",
      },
      update: {},
    });
    userId = u.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: userId, entityType: "_test" },
    });
    await prisma.$disconnect();
  });

  it("persists action + actor + entity + JSON before/after", async () => {
    await writeAudit({
      actorUserId: userId,
      entityType: "_test",
      entityId: "fixture-1",
      action: "_test.write",
      before: { state: "open" },
      after: { state: "closed" },
      reason: "integration fixture",
    });

    const row = await prisma.auditLog.findFirst({
      where: { entityType: "_test", entityId: "fixture-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    expect(row?.action).toBe("_test.write");
    expect(row?.actorUserId).toBe(userId);
    expect(JSON.stringify(row?.before)).toContain("open");
    expect(JSON.stringify(row?.after)).toContain("closed");
  });
});

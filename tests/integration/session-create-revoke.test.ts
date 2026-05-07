import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  hashIp,
  hashUserAgent,
  touchSession,
  revokeAllSessionsForUser,
  revokeMostRecentSessionForUser,
} from "../../src/lib/auth/sessions";

/**
 * Round-11 §2D — UserSession integration test.
 *
 * Skipped without DATABASE_URL. CI provisions Postgres + runs
 * `prisma migrate deploy && npm run db:seed:defaults` before this
 * suite fires.
 */

describe.skipIf(!process.env.DATABASE_URL)("session create + revoke", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const u = await prisma.user.upsert({
      where: { email: "ses-test@example.test" },
      create: {
        email: "ses-test@example.test",
        name: "Session Test",
        role: "READ_ONLY",
        passwordHash: "x",
      },
      update: {},
    });
    userId = u.id;
    await prisma.userSession.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.$disconnect();
  });

  it("hashes IP and UA with a salted prefix", () => {
    const ipHash = hashIp("192.0.2.1");
    expect(ipHash).toMatch(/^ip:[0-9a-f]+$/);
    expect(hashIp(null)).toBeNull();

    const uaHash = hashUserAgent("Mozilla/5.0");
    expect(uaHash).toMatch(/^ua:[0-9a-f]+$/);
  });

  it("touchSession creates the first session when none exists", async () => {
    await touchSession(userId, "192.0.2.5", "Mozilla/5.0 (touchSession test)");
    const rows = await prisma.userSession.findMany({ where: { userId } });
    expect(rows.length).toBe(1);
    expect(rows[0].ipHash).toMatch(/^ip:/);
    expect(rows[0].uaFingerprint).toMatch(/^ua:/);
    expect(rows[0].revokedAt).toBeNull();
    expect(rows[0].expiresAt).not.toBeNull();
  });

  it("touchSession debounces — second call within 60s does not insert", async () => {
    const before = await prisma.userSession.count({ where: { userId } });
    await touchSession(userId, "192.0.2.5", "Mozilla/5.0 (touchSession test)");
    const after = await prisma.userSession.count({ where: { userId } });
    expect(after).toBe(before);
  });

  it("revokeAllSessionsForUser sets revokedAt on every active row", async () => {
    const revoked = await revokeAllSessionsForUser(userId);
    expect(revoked).toBeGreaterThanOrEqual(1);
    const stillActive = await prisma.userSession.count({
      where: { userId, revokedAt: null },
    });
    expect(stillActive).toBe(0);
  });

  it("revokeMostRecentSessionForUser is a no-op when none active", async () => {
    await revokeMostRecentSessionForUser(userId);
    const stillActive = await prisma.userSession.count({
      where: { userId, revokedAt: null },
    });
    expect(stillActive).toBe(0);
  });
});

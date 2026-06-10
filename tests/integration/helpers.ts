import type { PrismaClient } from "@prisma/client";

/**
 * Round-16 — race-proof shared fixture.
 *
 * Four integration files upsert the IT-DIST district in their
 * beforeAll hooks, and vitest runs files in parallel: on a fresh CI
 * database two upserts can race the create path and one loses with
 * P2002 (Prisma's upsert is find-then-create here, not ON
 * CONFLICT). Catch the loss and re-read — the row exists either
 * way.
 */
export async function ensureIntegrationDistrict(prisma: PrismaClient) {
  try {
    return await prisma.district.upsert({
      where: { code: "IT-DIST" },
      create: {
        code: "IT-DIST",
        name: "Integration District",
        region: "NYC",
      },
      update: {},
    });
  } catch {
    return prisma.district.findUniqueOrThrow({
      where: { code: "IT-DIST" },
    });
  }
}

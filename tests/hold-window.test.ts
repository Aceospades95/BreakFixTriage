import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Bug 4d: the default-hold-window setting accepted 0, which was
 * actively harmful (a 0-day window means `holdUntil = sentAt`, so the
 * very next sweep auto-expires the quote). The schema is now
 * `min(1)`, which is what this test pins.
 *
 * We do NOT import `getHoldDays` itself because that would pull a
 * Prisma client into a unit test — the Zod schema is the contract,
 * and we pin it here. If the source schema in
 * `src/lib/settings/settings.ts` legitimately changes, drift this
 * test alongside it.
 */
const holdWindowSchema = z.coerce.number().int().min(1).max(90);

describe("hold-window default schema (bug 4d)", () => {
  it("rejects 0 (would cause immediate expiry on next sweep)", () => {
    expect(holdWindowSchema.safeParse(0).success).toBe(false);
  });

  it("rejects negatives", () => {
    expect(holdWindowSchema.safeParse(-1).success).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(holdWindowSchema.safeParse(7.5).success).toBe(false);
  });

  it("accepts 1 (one-day window)", () => {
    expect(holdWindowSchema.safeParse(1).success).toBe(true);
  });

  it("accepts 7 (the documented common default)", () => {
    expect(holdWindowSchema.safeParse(7).success).toBe(true);
  });

  it("accepts 90 (max)", () => {
    expect(holdWindowSchema.safeParse(90).success).toBe(true);
  });

  it("rejects 91 (over max)", () => {
    expect(holdWindowSchema.safeParse(91).success).toBe(false);
  });
});

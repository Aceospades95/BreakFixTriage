import { describe, it, expect } from "vitest";
import { shouldEscalate } from "@/lib/escalation/sweep";

describe("shouldEscalate", () => {
  it("returns false when the threshold is null", () => {
    expect(shouldEscalate(100, null, 2)).toBe(false);
  });

  it("returns false when the threshold is zero or negative", () => {
    expect(shouldEscalate(100, 0, 2)).toBe(false);
    expect(shouldEscalate(100, -1, 2)).toBe(false);
  });

  it("returns false when the multiplier is zero or negative", () => {
    expect(shouldEscalate(100, 10, 0)).toBe(false);
    expect(shouldEscalate(100, 10, -2)).toBe(false);
  });

  it("returns false when days is below threshold × multiplier", () => {
    expect(shouldEscalate(10, 10, 2)).toBe(false); // 10 < 20
    expect(shouldEscalate(19, 10, 2)).toBe(false); // 19 < 20
  });

  it("returns true at exactly threshold × multiplier", () => {
    expect(shouldEscalate(20, 10, 2)).toBe(true);
  });

  it("returns true well past threshold × multiplier", () => {
    expect(shouldEscalate(30, 10, 2)).toBe(true);
    expect(shouldEscalate(1000, 10, 2)).toBe(true);
  });

  it("handles fractional multipliers", () => {
    // threshold 10, multiplier 1.5 → 15
    expect(shouldEscalate(14, 10, 1.5)).toBe(false);
    expect(shouldEscalate(15, 10, 1.5)).toBe(true);
  });

  it("handles multiplier 1 (escalate at first breach)", () => {
    expect(shouldEscalate(9, 10, 1)).toBe(false);
    expect(shouldEscalate(10, 10, 1)).toBe(true);
  });
});

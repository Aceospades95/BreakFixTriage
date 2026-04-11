import { describe, it, expect } from "vitest";
import { computeMinutes } from "@/lib/time/time-tracking";

describe("computeMinutes", () => {
  it("rounds to the nearest whole minute", () => {
    expect(
      computeMinutes(
        new Date("2026-04-20T09:00:00Z"),
        new Date("2026-04-20T09:30:45Z"),
      ),
    ).toBe(31);
    expect(
      computeMinutes(
        new Date("2026-04-20T09:00:00Z"),
        new Date("2026-04-20T09:29:15Z"),
      ),
    ).toBe(29);
  });

  it("returns 0 for identical timestamps", () => {
    const t = new Date("2026-04-20T12:00:00Z");
    expect(computeMinutes(t, t)).toBe(0);
  });

  it("clamps negative differences to 0 (clock skew safe)", () => {
    expect(
      computeMinutes(
        new Date("2026-04-20T12:05:00Z"),
        new Date("2026-04-20T12:00:00Z"),
      ),
    ).toBe(0);
  });

  it("handles multi-hour durations", () => {
    expect(
      computeMinutes(
        new Date("2026-04-20T09:00:00Z"),
        new Date("2026-04-20T12:30:00Z"),
      ),
    ).toBe(210);
  });
});

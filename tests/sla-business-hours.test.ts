import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import {
  businessDaysBetween,
  isAgingOpenTicketBH,
  type BusinessHoursConfig,
} from "@/lib/reports/sla";

/**
 * Round-2 §12 — business-hours SLA math.
 */

const standard: BusinessHoursConfig = {
  enabled: true,
  holidayDates: new Set(),
  weekendDays: [0, 6], // Sun, Sat
};

describe("businessDaysBetween", () => {
  it("collapses to whole-day math when disabled", () => {
    const fri = new Date("2026-04-03T12:00:00Z"); // Friday
    const mon = new Date("2026-04-06T12:00:00Z"); // Monday
    expect(
      businessDaysBetween(mon, fri, { ...standard, enabled: false }),
    ).toBe(3);
  });

  it("excludes weekends", () => {
    const fri = new Date("2026-04-03T12:00:00Z"); // Friday
    const mon = new Date("2026-04-06T12:00:00Z"); // Monday — 3 calendar days, 1 business day
    expect(businessDaysBetween(mon, fri, standard)).toBe(1);
  });

  it("excludes a holiday in the set", () => {
    const fri = new Date("2026-04-03T12:00:00Z"); // Friday
    const wed = new Date("2026-04-08T12:00:00Z"); // Wednesday
    // Calendar: Sat, Sun, Mon, Tue, Wed → business 3 (Mon, Tue, Wed)
    // Mark Tue as a holiday → business 2.
    const cfg: BusinessHoursConfig = {
      ...standard,
      holidayDates: new Set(["2026-04-07"]),
    };
    expect(businessDaysBetween(wed, fri, cfg)).toBe(2);
  });

  it("returns 0 for a same-day diff", () => {
    const t = new Date("2026-04-15T10:00:00Z");
    expect(businessDaysBetween(t, t, standard)).toBe(0);
  });

  it("returns 0 for a negative diff (clock skew)", () => {
    const a = new Date("2026-04-15T10:00:00Z");
    const b = new Date("2026-04-16T10:00:00Z");
    expect(businessDaysBetween(a, b, standard)).toBe(0);
  });
});

describe("isAgingOpenTicketBH", () => {
  it("uses business days when config enabled", () => {
    // Reported Friday 2026-04-03; queried following Friday
    // 2026-04-10 — 5 business days. Threshold 5 → not flagged
    // (strict greater-than rule). Threshold 4 → flagged.
    const t = {
      reportedAt: new Date("2026-04-03T09:00:00Z"),
      state: TicketState.TRIAGE,
    };
    const now = new Date("2026-04-10T09:00:00Z");
    expect(isAgingOpenTicketBH(t, now, 5, standard)).toBe(false);
    expect(isAgingOpenTicketBH(t, now, 4, standard)).toBe(true);
  });

  it("never flags closed tickets even when business config is enabled", () => {
    const t = {
      reportedAt: new Date("2025-01-01T00:00:00Z"),
      state: TicketState.CLOSED,
    };
    expect(isAgingOpenTicketBH(t, new Date(), 1, standard)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import {
  daysOpen,
  isAgingOpenTicket,
  wholeDaysBetween,
} from "@/lib/reports/sla";

/**
 * Bug 4c: aging cutoff was off-by-one.
 *
 * The original `agingTickets` query used `cutoff = now - 30 days`
 * with `reportedAt: { lt: cutoff }`, which translates to
 * `now - reportedAt > 30 days` in milliseconds — so a ticket reported
 * at 00:00 on the day exactly 30 days ago would still cross the
 * threshold whenever `now` was past 00:00 (any sub-day fraction
 * tipped it over).
 *
 * The canonical rule (ADR 0002) is:
 *
 *     flagged ⇔ floor((now - reportedAt) / DAY) > thresholdDays
 *
 * i.e. *strict* greater-than, on whole-day buckets.
 */
describe("wholeDaysBetween", () => {
  it("counts whole days, flooring sub-day fractions", () => {
    expect(
      wholeDaysBetween(
        new Date("2026-05-05T11:00:00Z"),
        new Date("2026-04-05T00:00:00Z"),
      ),
    ).toBe(30); // 30d 11h floors to 30
    expect(
      wholeDaysBetween(
        new Date("2026-05-05T11:00:00Z"),
        new Date("2026-04-05T11:00:00Z"),
      ),
    ).toBe(30); // exactly 30d = 30
    expect(
      wholeDaysBetween(
        new Date("2026-05-06T00:00:00Z"),
        new Date("2026-04-05T11:00:00Z"),
      ),
    ).toBe(30); // 30d 13h floors to 30
    expect(
      wholeDaysBetween(
        new Date("2026-05-06T11:00:00Z"),
        new Date("2026-04-05T11:00:00Z"),
      ),
    ).toBe(31); // exactly 31d
  });

  it("clamps negative to 0 (clock skew / future-dated tickets)", () => {
    expect(
      wholeDaysBetween(
        new Date("2026-04-01T00:00:00Z"),
        new Date("2026-04-05T00:00:00Z"),
      ),
    ).toBe(0);
  });
});

describe("daysOpen", () => {
  const now = new Date("2026-05-05T12:00:00Z");

  it("counts whole days since reportedAt", () => {
    expect(
      daysOpen({ reportedAt: new Date("2026-04-30T12:00:00Z") }, now),
    ).toBe(5);
  });
});

describe("isAgingOpenTicket — strict-greater-than rule", () => {
  const now = new Date("2026-05-05T11:00:00Z");
  const reported2026Apr05 = new Date("2026-04-05T00:00:00Z");

  it("does NOT flag a ticket reported exactly 30 days ago at the threshold of 30", () => {
    // The headline bug 4c repro: reported 2026-04-05, today 2026-05-05,
    // threshold 30 → must be false.
    expect(
      isAgingOpenTicket(
        { reportedAt: reported2026Apr05, state: TicketState.TRIAGE },
        now,
        30,
      ),
    ).toBe(false);
  });

  it("DOES flag a ticket reported 31 days ago at threshold 30", () => {
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2026-04-04T00:00:00Z"),
          state: TicketState.TRIAGE,
        },
        now,
        30,
      ),
    ).toBe(true);
  });

  it("does not flag a CLOSED ticket regardless of age", () => {
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2020-01-01T00:00:00Z"),
          state: TicketState.CLOSED,
        },
        now,
        30,
      ),
    ).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2026-04-29T00:00:00Z"),
          state: TicketState.TRIAGE,
        },
        now,
        7,
      ),
    ).toBe(false); // 6 days, threshold 7
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2026-04-27T00:00:00Z"),
          state: TicketState.TRIAGE,
        },
        now,
        7,
      ),
    ).toBe(true); // 8 days, threshold 7
  });

  it("treats threshold=0 as 'flag anything > 0 days'", () => {
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2026-05-05T11:00:00Z"),
          state: TicketState.TRIAGE,
        },
        now,
        0,
      ),
    ).toBe(false); // exactly 0 days
    expect(
      isAgingOpenTicket(
        {
          reportedAt: new Date("2026-05-04T00:00:00Z"),
          state: TicketState.TRIAGE,
        },
        now,
        0,
      ),
    ).toBe(true); // 1 day
  });
});

import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import {
  DEFAULT_SLA_DAYS,
  daysInState,
  slaHealth,
} from "@/lib/reports/sla";

describe("daysInState", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  it("returns 0 for a brand new ticket", () => {
    expect(
      daysInState(
        {
          state: TicketState.TRIAGE,
          stateEnteredAt: new Date("2026-04-20T10:00:00Z"),
          reportedAt: new Date("2026-04-20T10:00:00Z"),
        },
        now,
      ),
    ).toBe(0);
  });

  it("returns whole-day age for a ticket that's been sitting around", () => {
    expect(
      daysInState(
        {
          state: TicketState.DIAGNOSIS,
          stateEnteredAt: new Date("2026-04-15T12:00:00Z"),
          reportedAt: new Date("2026-04-15T12:00:00Z"),
        },
        now,
      ),
    ).toBe(5);
  });

  it("falls back to reportedAt if stateEnteredAt is null", () => {
    expect(
      daysInState(
        {
          state: TicketState.TRIAGE,
          stateEnteredAt: null,
          reportedAt: new Date("2026-04-18T12:00:00Z"),
        },
        now,
      ),
    ).toBe(2);
  });

  it("clamps negative diffs to 0 (clock skew)", () => {
    expect(
      daysInState(
        {
          state: TicketState.IMPORTED,
          stateEnteredAt: new Date("2026-04-21T00:00:00Z"),
          reportedAt: new Date("2026-04-21T00:00:00Z"),
        },
        now,
      ),
    ).toBe(0);
  });
});

describe("slaHealth", () => {
  it("returns na for states without a threshold", () => {
    expect(slaHealth(TicketState.CLOSED, 100)).toBe("na");
    expect(slaHealth(TicketState.ON_HOLD, 100)).toBe("na");
    expect(slaHealth(TicketState.QUOTE_DECLINED, 1)).toBe("na");
  });

  it("returns on_track well below the threshold", () => {
    expect(slaHealth(TicketState.AWAITING_PARTS, 1)).toBe("on_track");
  });

  it("returns approaching at 75% of the threshold", () => {
    // AWAITING_PARTS default = 10 days → 75% = 7 days
    expect(slaHealth(TicketState.AWAITING_PARTS, 7)).toBe("approaching");
    expect(slaHealth(TicketState.AWAITING_PARTS, 9)).toBe("approaching");
  });

  it("returns breached at or past the threshold", () => {
    expect(slaHealth(TicketState.AWAITING_PARTS, 10)).toBe("breached");
    expect(slaHealth(TicketState.AWAITING_PARTS, 30)).toBe("breached");
  });

  it("accepts a custom thresholds map", () => {
    const strict: Record<TicketState, number | null> = {
      ...DEFAULT_SLA_DAYS,
      TRIAGE: 1,
    };
    expect(slaHealth("TRIAGE", 0, strict)).toBe("on_track");
    expect(slaHealth("TRIAGE", 1, strict)).toBe("breached");
  });
});

describe("DEFAULT_SLA_DAYS", () => {
  it("covers every ticket state", () => {
    for (const state of Object.values(TicketState)) {
      expect(state in DEFAULT_SLA_DAYS).toBe(true);
    }
  });
});

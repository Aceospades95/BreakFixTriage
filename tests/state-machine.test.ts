import { describe, it, expect } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  allowedNextStates,
  canTransition,
  isTerminal,
} from "@/lib/workflow/states";
import type { TicketState } from "@prisma/client";

const ALL_STATES = Object.keys(ALLOWED_TRANSITIONS) as TicketState[];

describe("state machine: allowed transitions", () => {
  it("has a happy-path pickup lifecycle", () => {
    expect(canTransition("IMPORTED", "TRIAGE")).toBe(true);
    expect(canTransition("TRIAGE", "AWAITING_PICKUP")).toBe(true);
    expect(canTransition("AWAITING_PICKUP", "PICKUP_SCHEDULED")).toBe(true);
    expect(canTransition("PICKUP_SCHEDULED", "IN_WAREHOUSE")).toBe(true);
    expect(canTransition("IN_WAREHOUSE", "DIAGNOSIS")).toBe(true);
    expect(canTransition("DIAGNOSIS", "IN_REPAIR")).toBe(true);
    expect(canTransition("IN_REPAIR", "REPAIR_COMPLETED")).toBe(true);
    expect(canTransition("REPAIR_COMPLETED", "PENDING_DELIVERY")).toBe(true);
    expect(canTransition("PENDING_DELIVERY", "DELIVERY_SCHEDULED")).toBe(true);
    expect(canTransition("DELIVERY_SCHEDULED", "RETURNED")).toBe(true);
    expect(canTransition("RETURNED", "CLOSED")).toBe(true);
  });

  it("supports the quote branch", () => {
    expect(canTransition("DIAGNOSIS", "QUOTE_REQUIRED")).toBe(true);
    expect(canTransition("QUOTE_REQUIRED", "QUOTE_SENT")).toBe(true);
    expect(canTransition("QUOTE_SENT", "QUOTE_APPROVED")).toBe(true);
    expect(canTransition("QUOTE_APPROVED", "IN_REPAIR")).toBe(true);
    expect(canTransition("QUOTE_SENT", "QUOTE_DECLINED")).toBe(true);
    expect(canTransition("QUOTE_DECLINED", "PENDING_DELIVERY")).toBe(true);
    expect(canTransition("QUOTE_SENT", "QUOTE_NO_RESPONSE")).toBe(true);
    expect(canTransition("QUOTE_NO_RESPONSE", "OUT_OF_SCOPE")).toBe(true);
  });

  it("allows reopen from closed", () => {
    expect(canTransition("CLOSED", "REOPENED")).toBe(true);
    expect(canTransition("REOPENED", "TRIAGE")).toBe(true);
  });

  it("warehouse intake scan edges (Round-22 demo)", () => {
    // Migration intake: import the batch, scan the pile — each scan
    // moves its ticket straight to the warehouse.
    expect(canTransition("IMPORTED", "IN_WAREHOUSE")).toBe(true);
    // A device that physically arrives without a scheduled route.
    expect(canTransition("AWAITING_PICKUP", "IN_WAREHOUSE")).toBe(true);
  });

  it("rejects nonsense jumps", () => {
    expect(canTransition("IMPORTED", "CLOSED")).toBe(false);
    expect(canTransition("IN_REPAIR", "AWAITING_PICKUP")).toBe(false);
    expect(canTransition("AWAITING_PICKUP", "DELIVERY_SCHEDULED")).toBe(false);
    expect(canTransition("CLOSED", "TRIAGE")).toBe(false);
  });

  it("every non-terminal state has at least one outgoing edge", () => {
    for (const state of ALL_STATES) {
      if (isTerminal(state)) continue;
      expect(
        allowedNextStates(state).length,
        `state ${state} must have at least one outgoing transition`,
      ).toBeGreaterThan(0);
    }
  });

  it("ON_HOLD is reachable from every active state", () => {
    // Spec says ON_HOLD should be available as a side-transition from any
    // non-terminal, non-hold state that represents active work.
    const mustReachHold: TicketState[] = [
      "IMPORTED",
      "TRIAGE",
      "AWAITING_PICKUP",
      "PICKUP_SCHEDULED",
      "IN_WAREHOUSE",
      "DIAGNOSIS",
      "AWAITING_PARTS",
      "PARTS_ORDERED",
      "IN_REPAIR",
      "REPAIR_COMPLETED",
      "AWAITING_ONSITE",
      "ONSITE_IN_PROGRESS",
      "QUOTE_REQUIRED",
      "QUOTE_SENT",
      "QUOTE_APPROVED",
      "MANUFACTURER_RMA",
      "PENDING_DELIVERY",
      "DELIVERY_SCHEDULED",
    ];
    for (const s of mustReachHold) {
      expect(
        canTransition(s, "ON_HOLD"),
        `${s} should be able to go ON_HOLD`,
      ).toBe(true);
    }
  });

  it("closed is the only terminal state", () => {
    expect(isTerminal("CLOSED")).toBe(true);
    for (const s of ALL_STATES) {
      if (s === "CLOSED") continue;
      expect(isTerminal(s)).toBe(false);
    }
  });
});

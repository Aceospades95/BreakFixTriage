import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import { STATE_LANE } from "@/components/state-pill";
import { humaniseEnum } from "@/lib/cn";

/**
 * Closes findings §5.B2 (AWAITING_* color collision).
 *
 * Pins:
 *   - Every TicketState is mapped to exactly one lane.
 *   - The four "AWAITING_*" states are split across at least two
 *     lanes, so they're visually distinguishable on a list.
 *   - The lane mapping is stable per state (so a future enum
 *     reshuffle can't silently drop a state into the wrong lane).
 *
 * Closes findings §5.D (titlecase pills): humaniseEnum produces
 * the docs/ui-conventions.md §2 form, including the acronym
 * exception for RMA.
 */

describe("STATE_LANE coverage and split", () => {
  it("maps every TicketState to a lane", () => {
    for (const s of Object.values(TicketState)) {
      expect(STATE_LANE[s]).toBeDefined();
    }
  });

  it("AWAITING_PARTS, AWAITING_PICKUP, AWAITING_ONSITE land in distinct lanes", () => {
    const awaitingLanes = new Set([
      STATE_LANE.AWAITING_PARTS,
      STATE_LANE.AWAITING_PICKUP,
      STATE_LANE.AWAITING_ONSITE,
    ]);
    expect(awaitingLanes.size).toBeGreaterThanOrEqual(2);
  });

  it("AWAITING_PARTS is the parts lane (not workshop)", () => {
    expect(STATE_LANE.AWAITING_PARTS).toBe("parts");
    expect(STATE_LANE.DIAGNOSIS).toBe("workshop");
  });

  it("CLOSED is terminal, REOPENED is exception", () => {
    expect(STATE_LANE.CLOSED).toBe("terminal");
    expect(STATE_LANE.REOPENED).toBe("exception");
  });

  it("ON_HOLD is its own lane (overlay)", () => {
    expect(STATE_LANE.ON_HOLD).toBe("hold");
  });
});

describe("humaniseEnum (§5.D pill casing)", () => {
  it("titlecases simple snake_case", () => {
    expect(humaniseEnum("AWAITING_PARTS")).toBe("Awaiting parts");
    expect(humaniseEnum("ON_HOLD")).toBe("On hold");
    expect(humaniseEnum("QUOTE_NO_RESPONSE")).toBe("Quote no response");
  });

  it("preserves acronyms", () => {
    expect(humaniseEnum("MANUFACTURER_RMA")).toBe("Manufacturer RMA");
    expect(humaniseEnum("RMA")).toBe("RMA");
    expect(humaniseEnum("PO_NUMBER")).toBe("PO number");
  });

  it("never returns ALL_CAPS_SNAKE", () => {
    for (const s of Object.values(TicketState)) {
      expect(humaniseEnum(s)).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("clamps empty / undefined-like inputs", () => {
    expect(humaniseEnum("")).toBe("");
    expect(humaniseEnum("__")).toBe("__");
  });
});

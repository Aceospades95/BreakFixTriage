import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import { ALLOWED_TRANSITIONS, canTransition } from "@/lib/workflow/states";
import { STATE_LANE } from "@/components/state-pill";

/**
 * Regression-critical pure tests (§7 of the findings brief).
 *
 * These pin invariants that field testing has confirmed already
 * work. They MUST NOT regress. Tagged `@regression-critical`
 * conceptually — the runner doesn't filter by tag, but the file
 * name (`regression-critical.test.ts`) signals the gate.
 *
 * Browser-side checks (kanban DnD persistence, popover dismissal,
 * search shortcut) live in qa/playwright/regression-critical.spec.ts.skeleton
 * — that's wired up once the e2e runtime is provisioned.
 */

describe("@regression-critical: state machine reachability", () => {
  it("every non-terminal state is reachable from IMPORTED via DFS", () => {
    const reachable = new Set<TicketState>([TicketState.IMPORTED]);
    const stack: TicketState[] = [TicketState.IMPORTED];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const next of ALLOWED_TRANSITIONS[cur] ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          stack.push(next);
        }
      }
    }
    for (const s of Object.values(TicketState)) {
      expect(
        reachable.has(s),
        `${s} not reachable from IMPORTED`,
      ).toBe(true);
    }
  });

  it("CLOSED is the only terminal state with a single outgoing edge to REOPENED", () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(["REOPENED"]);
  });

  it("ON_HOLD can return to many states (overlay-style today)", () => {
    expect(ALLOWED_TRANSITIONS.ON_HOLD.length).toBeGreaterThan(1);
  });

  it("IMPORTED → TRIAGE is allowed (the legacy import-routing edge)", () => {
    expect(canTransition("IMPORTED", "TRIAGE")).toBe(true);
  });

  it("an arbitrary illegal edge is rejected", () => {
    expect(canTransition("IMPORTED", "CLOSED")).toBe(false);
    expect(canTransition("IMPORTED", "DELIVERY_SCHEDULED")).toBe(false);
  });
});

describe("@regression-critical: state pill lanes", () => {
  it("every state has a lane", () => {
    for (const s of Object.values(TicketState)) {
      expect(STATE_LANE[s]).toBeDefined();
    }
  });

  it("AWAITING_PARTS sits in the parts lane (distinct from workshop)", () => {
    // Closes findings §5.B2 — must not regress to amber.
    expect(STATE_LANE.AWAITING_PARTS).toBe("parts");
    expect(STATE_LANE.DIAGNOSIS).toBe("workshop");
  });
});

describe("@regression-critical: allowed-transition catalogue size", () => {
  it("every state appears as a key", () => {
    for (const s of Object.values(TicketState)) {
      expect(s in ALLOWED_TRANSITIONS).toBe(true);
    }
  });

  it("CLOSED's own outgoing edges exactly match the documented terminal contract", () => {
    // CLOSED is the only "terminal" state in the legacy 26-state
    // graph (REOPENED is its escape). If this changes silently
    // dashboards / cutover-compare quietly disagree.
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(["REOPENED"]);
  });
});

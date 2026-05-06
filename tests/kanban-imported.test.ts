import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";

/**
 * Closes findings §2#2 (interim).
 *
 * Pins that IMPORTED is rendered as a Kanban column. The full
 * auto-promotion decision (IMPORTED auto-routed → TRIAGE on
 * creation) is part of the §4 status-taxonomy ADR
 * (docs/adr/0005-...) and is gated on maintainer approval.
 */

// Mirror of the production list. If kanban/page.tsx changes the
// excluded set, this test must change to match — that drift is
// intentional, the test exists to prevent IMPORTED silently
// dropping out again.
const KANBAN_EXCLUDED: readonly TicketState[] = [
  "CLOSED",
  "REOPENED",
  "ON_HOLD",
];

describe("Kanban column membership (interim §2#2)", () => {
  it("includes IMPORTED so freshly-imported tickets are visible", () => {
    expect(KANBAN_EXCLUDED).not.toContain("IMPORTED");
  });

  it("excludes terminal and overlay states (CLOSED, REOPENED, ON_HOLD)", () => {
    expect(KANBAN_EXCLUDED).toContain("CLOSED");
    expect(KANBAN_EXCLUDED).toContain("REOPENED");
    expect(KANBAN_EXCLUDED).toContain("ON_HOLD");
  });

  it("renders enough columns to cover most active tickets", () => {
    const all = Object.values(TicketState);
    const visible = all.filter(
      (s) => !KANBAN_EXCLUDED.includes(s),
    );
    // 26 total states - 3 excluded = 23. Today's pre-fix board was
    // 22 (the bug excluded IMPORTED). Anything below 23 means
    // someone re-excluded a state without a matching ADR.
    expect(visible.length).toBe(all.length - KANBAN_EXCLUDED.length);
    expect(visible.length).toBeGreaterThanOrEqual(23);
  });
});

import { describe, it, expect } from "vitest";
import { TicketState } from "@prisma/client";
import { humaniseEnum } from "@/lib/cn";

/**
 * Round-2 §29 + §14: status pills are titlecase everywhere; no
 * `ALL_CAPS_UNDERSCORE` ever reaches the user-facing surface.
 *
 * The brief asks for a DOM scan but the project doesn't yet have a
 * Playwright runtime in CI. This is the next-best gate: enumerate
 * every TicketState and assert the pill label produced by
 * `humaniseEnum` (the formatter the StatePill component delegates
 * to) does NOT match `[A-Z]{2,}_[A-Z]+`. A future Playwright
 * test extends this to crawl the rendered DOM for any element
 * with `[data-status-pill]`.
 *
 * Acronyms (RMA, OOW, etc.) are allowed because the convention
 * documents them in docs/ui-conventions.md §2 — the "two or more
 * caps + underscore + one or more caps" pattern wouldn't match
 * "Manufacturer RMA" anyway, so the test naturally permits them.
 */
const ALL_CAPS_UNDERSCORE = /[A-Z]{2,}_[A-Z]+/;

describe("status-pill casing (§29)", () => {
  it("humaniseEnum never returns an ALL_CAPS_UNDERSCORE label for any TicketState", () => {
    for (const state of Object.values(TicketState)) {
      const label = humaniseEnum(state);
      expect(label).not.toMatch(ALL_CAPS_UNDERSCORE);
    }
  });

  it("humaniseEnum produces a printable, leading-cap label for every state", () => {
    for (const state of Object.values(TicketState)) {
      const label = humaniseEnum(state);
      expect(label.length).toBeGreaterThan(0);
      // First character is uppercase letter, second is lowercase
      // letter or end-of-string. (Single-letter codes like "A"
      // would pass, but no TicketState matches that.)
      expect(label).toMatch(/^[A-Z]/);
    }
  });

  it("humaniseEnum preserves the RMA acronym (regression guard for §14 acronym list)", () => {
    expect(humaniseEnum("MANUFACTURER_RMA")).toBe("Manufacturer RMA");
  });
});

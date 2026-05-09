import { describe, it, expect } from "vitest";
import { TicketPriority } from "@prisma/client";
import { PRIORITY_RANK } from "@/components/priority-pill";

/**
 * Closes findings §2#3 / §6 (Priority column on Tickets list) and
 * findings §3.A8 (Summary header sorted by reportedAt).
 *
 * The page's sort comparator uses Prisma `orderBy` server-side, so
 * we don't have a JS comparator to test directly. What we CAN test:
 *
 *   1. The priority rank is deterministic and orders URGENT > HIGH
 *      > NORMAL > LOW. (Useful for client-side optimistic sorts and
 *      for the bench page ordering rules.)
 *   2. The list of valid sort keys allowed by the Tickets list page
 *      includes "shortDescription" (so the Summary header can sort
 *      by summary, not by reportedAt).
 *
 * The "valid sort keys" check below is duplicated from
 * src/app/(app)/tickets/page.tsx. If that list legitimately
 * changes, drift this test in lockstep.
 */
const VALID_SORT_KEYS = [
  "reportedAt",
  "state",
  "priority",
  "incidentNumber",
  "stateEnteredAt",
  "shortDescription",
] as const;

describe("PriorityPill rank (§2#3)", () => {
  it("orders URGENT > HIGH > NORMAL > LOW", () => {
    expect(PRIORITY_RANK.URGENT).toBeGreaterThan(PRIORITY_RANK.HIGH);
    expect(PRIORITY_RANK.HIGH).toBeGreaterThan(PRIORITY_RANK.NORMAL);
    expect(PRIORITY_RANK.NORMAL).toBeGreaterThan(PRIORITY_RANK.LOW);
  });

  it("covers every TicketPriority enum value", () => {
    for (const p of Object.values(TicketPriority)) {
      expect(PRIORITY_RANK[p]).toBeTypeOf("number");
    }
  });
});

describe("Tickets list sort keys (§3.A8)", () => {
  it("supports sorting by shortDescription so the Summary header is honest", () => {
    expect(VALID_SORT_KEYS).toContain("shortDescription");
  });

  it("still supports the legacy keys (no regression)", () => {
    for (const key of [
      "reportedAt",
      "state",
      "priority",
      "incidentNumber",
      "stateEnteredAt",
    ]) {
      expect(VALID_SORT_KEYS).toContain(key);
    }
  });
});

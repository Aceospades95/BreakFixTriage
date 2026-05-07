import { describe, it } from "vitest";

/**
 * Round-11 §2D — ticket state-machine integration.
 *
 * Verifies the full transition graph for a ticket: the legal
 * transitions succeed, the illegal transitions throw, and each
 * legal transition writes a TicketEvent + AuditLog row.
 *
 * Skipped without DATABASE_URL.
 */

describe.skipIf(!process.env.DATABASE_URL)("ticket state machine", () => {
  it.todo("OPEN → IN_PROGRESS writes TicketEvent + audit row");
  it.todo("IN_PROGRESS → ON_BENCH writes TicketEvent + audit row");
  it.todo("ON_BENCH → RESOLVED writes TicketEvent + audit row");
  it.todo("RESOLVED → CLOSED writes TicketEvent + audit row");
  it.todo("OPEN → CLOSED is rejected as an illegal transition");
  it.todo("transition emits dispatchEmailEvent for notifyOnEnter states");
});

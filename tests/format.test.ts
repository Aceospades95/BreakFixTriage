import { describe, it, expect } from "vitest";
import { Role, TicketPriority, TicketState } from "@prisma/client";
import {
  humanise,
  formatRole,
  formatPriority,
  formatStatus,
  formatSource,
} from "@/lib/format";

/**
 * Round-3 §G — humanise() and friends.
 *
 * The brief is explicit: every enum value the user can see goes
 * through this module. The CI scan in
 * `tests/forbidden-tokens.test.ts` extends to flag any
 * `[A-Z]{2,}_[A-Z]+` in user-visible DOM, but the unit-level
 * coverage that pin the formatter contracts is here.
 */

describe("humanise() and wrappers", () => {
  it("titlecases a snake-case enum value", () => {
    expect(humanise("AWAITING_PARTS")).toBe("Awaiting parts");
    expect(humanise("QUOTE_NO_RESPONSE")).toBe("Quote no response");
  });

  it("preserves documented acronyms", () => {
    expect(humanise("MANUFACTURER_RMA")).toBe("Manufacturer RMA");
    expect(humanise("PO_NUMBER")).toBe("PO number");
    expect(humanise("RMA")).toBe("RMA");
  });

  it("formatRole pins to Role union", () => {
    expect(formatRole(Role.OPS_MANAGER)).toBe("Ops manager");
    expect(formatRole(Role.READ_ONLY)).toBe("Read only");
    expect(formatRole(Role.ADMIN)).toBe("Admin");
  });

  it("formatPriority pins to TicketPriority", () => {
    expect(formatPriority(TicketPriority.URGENT)).toBe("Urgent");
    expect(formatPriority(TicketPriority.NORMAL)).toBe("Normal");
  });

  it("formatStatus pins to TicketState", () => {
    expect(formatStatus(TicketState.PENDING_DELIVERY)).toBe(
      "Pending delivery",
    );
    expect(formatStatus(TicketState.OUT_OF_SCOPE)).toBe("Out of scope");
    expect(formatStatus(TicketState.QUOTE_DECLINED)).toBe("Quote declined");
  });

  it("formatSource accepts any string (open extension point)", () => {
    expect(formatSource("PORTAL")).toBe("Portal");
    expect(formatSource("SNOW")).toBe("Snow");
    expect(formatSource("MANUAL")).toBe("Manual");
  });

  it("never returns ALL_CAPS_UNDERSCORE for any Role / Priority / TicketState", () => {
    const RX = /[A-Z]{2,}_[A-Z]+/;
    for (const r of Object.values(Role)) {
      expect(formatRole(r)).not.toMatch(RX);
    }
    for (const p of Object.values(TicketPriority)) {
      expect(formatPriority(p)).not.toMatch(RX);
    }
    for (const s of Object.values(TicketState)) {
      expect(formatStatus(s)).not.toMatch(RX);
    }
  });
});

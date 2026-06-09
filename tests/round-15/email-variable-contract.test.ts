import { describe, expect, it } from "vitest";
import { TEMPLATE_SEEDS } from "@/lib/email/template-seed-data";
import { validateVariables } from "@/lib/email/render";

/**
 * Round-15 — email variable contract pin.
 *
 * The R15 audit found six of nine dispatchEmailEvent call sites
 * passing flat ids while the templates require the nested
 * `{ ticket, link, … }` shape — every send from those paths failed
 * validation and dead-lettered. The fix routes all ticket-family
 * call sites through `buildTicketEmailVariables` + per-event
 * extras.
 *
 * This test pins the contract: for each ticket-family template,
 * the builder shape + the extras its call site supplies must
 * satisfy the template's `required` keys. Adding a new required
 * key to a template seed without updating the matching call site
 * fails here instead of dead-lettering in production.
 */

// What buildTicketEmailVariables always provides.
const BUILDER_SHAPE = {
  ticket: {
    number: "INC0000001",
    summary: "s",
    school: "x",
    priority: "Normal",
    status: "Triage",
  },
  link: "https://example.test/tickets/INC0000001",
};

// The extras each call site merges on top of the builder output.
// Mirrors src/server/actions/* and src/lib/workflow/transition.ts.
const EXTRAS_BY_EVENT: Record<string, Record<string, unknown>> = {
  ticket_created: { reporter: { name: "n", email: "e" } },
  ticket_assigned: { assignee: { name: "n", email: "e" } },
  ticket_status_changed: { status: { label: "l" }, reason: "" },
  quote_sent: { quote: { amount: "$1.00", holdUntil: "2026-01-01" } },
  quote_approved: { reason: "" },
  quote_approved_internal: { quote: { amount: "$1.00" } },
  delivery_scheduled: { stop: { window: "2026-01-01" }, driver: { name: "n" } },
  delivery_completed_with_receipt: { recipient: { name: "n" } },
  status_in_repair: { reason: "" },
  status_parts_ordered: { reason: "" },
  ticket_closed: { reason: "" },
  pickup_completed: {},
  ticket_update_to_spoc: { body: "b", customSubject: "" },
  sla_breach_warning: { status: { label: "l", slaThreshold: 5 } },
  sla_breached: { status: { label: "l", slaThreshold: 5 } },
};

const NON_TICKET_TEMPLATES = new Set(["daily_digest"]);

describe("Round-15 — email variable contract", () => {
  for (const seed of TEMPLATE_SEEDS) {
    if (NON_TICKET_TEMPLATES.has(seed.key)) continue;
    it(`${seed.key}: builder + call-site extras satisfy required variables`, () => {
      const extras = EXTRAS_BY_EVENT[seed.key];
      expect(
        extras,
        `${seed.key} has no entry in EXTRAS_BY_EVENT — add one mirroring its call site`,
      ).toBeDefined();
      const payload = { ...BUILDER_SHAPE, ...extras };
      const result = validateVariables(seed.variables, payload);
      expect(
        result.ok,
        result.ok
          ? undefined
          : `${seed.key} missing: ${(result as { missing: string[] }).missing.join(", ")}`,
      ).toBe(true);
    });
  }
});

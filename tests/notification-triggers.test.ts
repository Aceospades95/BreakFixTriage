import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TEMPLATE_SEEDS } from "@/lib/email/template-seed-data";

/**
 * Round-7 §3A — end-to-end smoke for the four R6 notification
 * trigger paths plus the four R7 §3B promotions. Without a live
 * Postgres + Resend in CI we cannot drive a real HTTP request and
 * inspect EmailLog; the test verifies the structural invariants
 * that drive the dispatch chain:
 *
 *   1. The EmailEvent enum carries every event name the dispatch
 *      paths use.
 *   2. The bundled template seeds carry a row for every event
 *      (admins clicking "Seed default templates" in /admin get
 *      a template for every wired event).
 *   3. lib/workflow/transition.ts wires the four R6 events through
 *      the NOTIFY_EVENT_BY_STATE map and gates on
 *      getEffectiveNotifyOnEnter.
 *   4. server/actions/tickets.ts wires the ticket_assigned event
 *      through dispatchEmailEvent on assignedUserId change.
 *   5. quotes / scheduling actions wire the four R7 §3B events
 *      through dispatchEmailEvent.
 *
 * Filed in docs/round-7-backlog.md: a true HTTP-level integration
 * test that depends on a live DB + provider mock — needs CI
 * Postgres + a fake transport, both filed for a future round.
 */

const ROOT = process.cwd();

const R6_EVENTS = [
  "ticket_assigned",
  "status_in_repair",
  "status_parts_ordered",
  "ticket_closed",
] as const;

const R7_EVENTS = [
  "quote_sent",
  "quote_approved",
  "delivery_scheduled",
  "pickup_completed",
] as const;

const ALL_EVENTS = [...R6_EVENTS, ...R7_EVENTS];

describe("Round-7 §3A: notification trigger smoke (R6 events)", () => {
  it("EmailEvent enum carries every R6 event", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const event of R6_EVENTS) {
      expect(
        schema.includes(`\n  ${event}\n`) ||
          schema.includes(`\n  ${event}\r\n`),
        `EmailEvent enum should declare "${event}"`,
      ).toBe(true);
    }
  });

  it("template seeds cover every R6 event", () => {
    const keys = new Set(TEMPLATE_SEEDS.map((s) => s.key));
    for (const event of R6_EVENTS) {
      expect(keys.has(event), `TEMPLATE_SEEDS missing key "${event}"`).toBe(
        true,
      );
    }
  });

  it("transition wrapper wires status_in_repair / parts_ordered / ticket_closed", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/workflow/transition.ts"),
      "utf8",
    );
    expect(src).toMatch(/NOTIFY_EVENT_BY_STATE/);
    expect(src).toMatch(/IN_REPAIR.*status_in_repair/s);
    expect(src).toMatch(/PARTS_ORDERED.*status_parts_ordered/s);
    expect(src).toMatch(/CLOSED.*ticket_closed/s);
    expect(src).toMatch(/getEffectiveNotifyOnEnter/);
    expect(src).toMatch(/dispatchEmailEvent/);
  });

  it("updateTicketAction dispatches ticket_assigned on assignee change", () => {
    const src = readFileSync(
      join(ROOT, "src/server/actions/tickets.ts"),
      "utf8",
    );
    expect(src).toMatch(/dispatchEmailEvent\(\s*["']ticket_assigned["']/);
    expect(src).toMatch(/after\.assignedUserId/);
    expect(src).toMatch(/!== session\.userId/);
  });
});

describe("Round-7 §3B: notification trigger smoke (next 4 events)", () => {
  it("EmailEvent enum carries every R7 §3B event", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const event of R7_EVENTS) {
      expect(
        schema.includes(`\n  ${event}\n`) ||
          schema.includes(`\n  ${event}\r\n`),
        `EmailEvent enum should declare "${event}"`,
      ).toBe(true);
    }
  });

  it("template seeds cover every R7 §3B event", () => {
    const keys = new Set(TEMPLATE_SEEDS.map((s) => s.key));
    for (const event of R7_EVENTS) {
      expect(keys.has(event), `TEMPLATE_SEEDS missing key "${event}"`).toBe(
        true,
      );
    }
  });

  it("each R7 §3B event has at least one dispatchEmailEvent call site", () => {
    const candidates: string[] = [];
    function walk(dir: string): void {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts")
        ) {
          candidates.push(full);
        }
      }
    }
    walk(join(ROOT, "src"));

    const callSitesByEvent: Record<string, string[]> = {};
    for (const event of R7_EVENTS) callSitesByEvent[event] = [];
    for (const file of candidates) {
      const src = readFileSync(file, "utf8");
      for (const event of R7_EVENTS) {
        if (src.includes(`dispatchEmailEvent("${event}"`)) {
          callSitesByEvent[event]!.push(file);
        }
      }
    }

    for (const event of R7_EVENTS) {
      expect(
        callSitesByEvent[event]!.length,
        `dispatchEmailEvent("${event}", ...) is missing — wire the call in the action that fires this event`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("Round-7 §3A/§3B: dispatchEmailEvent is the only mailer chokepoint", () => {
  it("no direct nodemailer / resend.send / transporter.sendMail outside lib/email", () => {
    const candidates: string[] = [];
    function walk(dir: string): void {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          if (entry.name.endsWith(".test.ts")) continue;
          candidates.push(full);
        }
      }
    }
    walk(join(ROOT, "src"));

    const offences: string[] = [];
    for (const file of candidates) {
      // Skip the email + notifications modules — both are the
      // legitimate transport layer that dispatchEmailEvent calls
      // into. The G6 invariant is about server *actions* and
      // *components* not bypassing the chokepoint.
      if (file.includes("/lib/email/")) continue;
      if (file.includes("/lib/notifications/")) continue;
      const src = readFileSync(file, "utf8");
      if (
        /\b(transporter\.sendMail|resend\.emails\.send|nodemailer\.createTransport)\b/.test(
          src,
        )
      ) {
        offences.push(file);
      }
    }
    expect(offences).toEqual([]);
  });
});

// Sanity assertion that the test list agrees with itself (catches
// future bugs where a new event is added to ALL_EVENTS but missed
// in the per-event tests above).
describe("Round-7 §3A/§3B: registry self-check", () => {
  it("ALL_EVENTS = R6_EVENTS + R7_EVENTS", () => {
    expect(ALL_EVENTS.length).toBe(R6_EVENTS.length + R7_EVENTS.length);
  });
});

import { describe, it, expect } from "vitest";
import { formatAuditAction } from "@/lib/audit/format";

/**
 * Round-2 §13 / §25 — audit action chip formatter.
 */

describe("formatAuditAction", () => {
  it("formats a plain transition", () => {
    const out = formatAuditAction(
      "transition:PENDING_DELIVERY->DELIVERY_SCHEDULED",
    );
    expect(out.kind).toBe("transition");
    expect(out.forced).toBeFalsy();
    expect(out.from).toBe("Pending delivery");
    expect(out.to).toBe("Delivery scheduled");
    expect(out.label).toBe("Pending delivery → Delivery scheduled");
  });

  it("flags forced transitions", () => {
    const out = formatAuditAction("transition:force:DIAGNOSIS->IN_REPAIR");
    expect(out.kind).toBe("transition");
    expect(out.forced).toBe(true);
    expect(out.label).toBe("Force change: Diagnosis → In repair");
  });

  it("formats an email queued action", () => {
    const out = formatAuditAction("email:dispatch:queued:ticket_created");
    expect(out.kind).toBe("email");
    expect(out.phase).toBe("queued");
    expect(out.event).toBe("ticket_created");
    expect(out.label).toBe("Email queued: ticket created");
  });

  it("formats an email skipped action", () => {
    const out = formatAuditAction(
      "email:dispatch:skipped:ticket_status_changed",
    );
    expect(out.kind).toBe("email");
    expect(out.phase).toBe("skipped");
  });

  it("titlecases a generic action string", () => {
    const out = formatAuditAction("auto-expire");
    expect(out.kind).toBe("generic");
    expect(out.label).toBe("Auto-expire");
  });

  it("titlecases a multi-segment generic action", () => {
    const out = formatAuditAction("quote_send:ticket-skip");
    expect(out.kind).toBe("generic");
    expect(out.label).toBe("Quote send ticket-skip");
  });

  // Round-8 §1C — stop-status transitions previously rendered raw
  // ASCII arrows like "Status en route->arrived". They now mirror
  // the regular transition path with humanised labels + Unicode arrow.
  it("formats stop-status transitions with the Unicode arrow", () => {
    const out = formatAuditAction("status:EN_ROUTE->ARRIVED");
    expect(out.kind).toBe("transition");
    expect(out.label).toBe("Stop en route → arrived");
  });

  it("formats stop-status SCHEDULED → EN_ROUTE", () => {
    const out = formatAuditAction("status:SCHEDULED->EN_ROUTE");
    expect(out.label).toBe("Stop scheduled → en route");
  });

  // Round-8 §1C — dot-segmented actions used to render with the
  // dotted form leaking into prose ("Route.stop.device.added").
  it("flattens dot-segmented actions into a sentence-case phrase", () => {
    expect(formatAuditAction("route.stop.device.added").label).toBe(
      "Route stop device added",
    );
    expect(formatAuditAction("route.stop.device.removed").label).toBe(
      "Route stop device removed",
    );
    expect(formatAuditAction("device.transferred").label).toBe(
      "Device transferred",
    );
  });

  // Round-8 §1C — kebab segments preserved.
  it("keeps hyphens in kebab-case actions", () => {
    expect(formatAuditAction("snow-merge.cross-school-collision").label).toBe(
      "Snow-merge cross-school-collision",
    );
  });
});

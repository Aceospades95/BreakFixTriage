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
});

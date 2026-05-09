import { describe, it, expect, vi } from "vitest";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Closes findings §3.A2 (Stage 1 — payload mirror).
 *
 * The writer mirrors `reason` and `transitionType` into the
 * audit row's `after` JSON so the audit log viewer can render them
 * inline without a schema migration. ADR 0006 captures the Stage-2
 * plan to promote them to dedicated columns.
 *
 * We mock the prisma client at the boundary; this is a pure
 * contract test on the writer's payload shape, not an integration
 * test against a real DB.
 */

function makeMock() {
  const create = vi.fn(async () => undefined);
  const tx = { auditLog: { create } } as unknown as Parameters<
    typeof writeAudit
  >[1];
  return { tx, create };
}

describe("writeAudit: reason + transitionType mirror (§3.A2)", () => {
  it("mirrors a bare reason into after.reason", async () => {
    const { tx, create } = makeMock();
    await writeAudit(
      {
        actorUserId: "u1",
        entityType: "Ticket",
        entityId: "t1",
        action: "transition:TRIAGE->AWAITING_PARTS",
        before: { state: "TRIAGE" },
        after: { state: "AWAITING_PARTS" },
        reason: "Tech ordered the wrong battery",
        transitionType: "manual",
      },
      tx,
    );
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]![0]!.data as Record<string, unknown>;
    const after = data.after as Record<string, unknown>;
    expect(after.state).toBe("AWAITING_PARTS");
    expect(after.reason).toBe("Tech ordered the wrong battery");
    expect(after.transitionType).toBe("manual");
  });

  it("preserves an existing after object and merges reason on top", async () => {
    const { tx, create } = makeMock();
    await writeAudit(
      {
        actorUserId: null,
        entityType: "Ticket",
        entityId: "t2",
        action: "transition:force:DIAGNOSIS->IN_REPAIR",
        before: { state: "DIAGNOSIS" },
        after: { state: "IN_REPAIR", forced: true },
        reason: "[forced] qa rebuild",
        transitionType: "forced",
      },
      tx,
    );
    const data = create.mock.calls[0]![0]!.data as Record<string, unknown>;
    const after = data.after as Record<string, unknown>;
    expect(after).toEqual({
      state: "IN_REPAIR",
      forced: true,
      reason: "[forced] qa rebuild",
      transitionType: "forced",
    });
  });

  it("when reason is undefined, after stays untouched", async () => {
    const { tx, create } = makeMock();
    await writeAudit(
      {
        actorUserId: "u1",
        entityType: "Ticket",
        entityId: "t3",
        action: "update",
        after: { priority: "URGENT" },
      },
      tx,
    );
    const data = create.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data.after).toEqual({ priority: "URGENT" });
  });

  it("system-actor (null) + scheduled type still mirrors reason", async () => {
    const { tx, create } = makeMock();
    await writeAudit(
      {
        actorUserId: null,
        entityType: "Ticket",
        entityId: "t4",
        action: "auto-expire",
        before: { state: "QUOTE_APPROVED" },
        after: { state: "QUOTE_NO_RESPONSE" },
        reason: "Auto-expired after hold window (2026-04-01)",
        transitionType: "scheduled",
      },
      tx,
    );
    const data = create.mock.calls[0]![0]!.data as Record<string, unknown>;
    const after = data.after as Record<string, unknown>;
    expect(after.transitionType).toBe("scheduled");
    expect(after.reason).toMatch(/Auto-expired/);
  });

  it("kanban transitionType is preserved end-to-end", async () => {
    const { tx, create } = makeMock();
    await writeAudit(
      {
        actorUserId: "u1",
        entityType: "Ticket",
        entityId: "t5",
        action: "transition:DIAGNOSIS->IN_REPAIR",
        before: { state: "DIAGNOSIS" },
        after: { state: "IN_REPAIR" },
        reason: "Kanban drag from kanban board",
        transitionType: "kanban",
      },
      tx,
    );
    const data = create.mock.calls[0]![0]!.data as Record<string, unknown>;
    const after = data.after as Record<string, unknown>;
    expect(after.transitionType).toBe("kanban");
  });
});

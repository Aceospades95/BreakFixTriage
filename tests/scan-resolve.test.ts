import { describe, it, expect } from "vitest";
import { normalizeScan } from "@/lib/scan/resolve";

describe("normalizeScan", () => {
  it("trims whitespace", () => {
    expect(normalizeScan("  INC1234567  ")).toBe("INC1234567");
  });

  it("leaves a plain value alone", () => {
    expect(normalizeScan("SN-0001")).toBe("SN-0001");
  });

  it("extracts the last path segment from a URL", () => {
    expect(normalizeScan("https://breakfix.local/tickets/abc123")).toBe(
      "abc123",
    );
    expect(normalizeScan("http://breakfix.local/admin/devices/xyz789/")).toBe(
      "xyz789",
    );
  });

  it("returns an empty string for an empty URL path", () => {
    // URL() parses this successfully, no path segments → falls back
    // to the original string which is just the host, which after
    // .trim() is non-empty but not useful. Test documents the
    // current behavior so nobody breaks it unwittingly.
    expect(normalizeScan("https://breakfix.local/")).toBe(
      "https://breakfix.local/",
    );
  });

  it("does not crash on malformed input", () => {
    expect(normalizeScan("")).toBe("");
    expect(normalizeScan("   ")).toBe("");
    expect(normalizeScan("!@#$%")).toBe("!@#$%");
  });
});

// Round-19 — tenant scoping on resolveScan (ADR 0014). A mock db
// captures the where clauses so we can assert the session's
// district filter is composed in for non-admins and absent for
// admins, without a live database.
import { resolveScan } from "@/lib/scan/resolve";
import type { BreakFixSession } from "@/lib/auth/session";

function mockDb() {
  const captured: Record<string, unknown> = {};
  const table = (name: string) => ({
    findFirst: async (args: { where: unknown }) => {
      captured[name] = args.where;
      return null;
    },
  });
  return {
    captured,
    db: {
      ticket: table("ticket"),
      device: table("device"),
      part: table("part"),
      school: table("school"),
    } as never,
  };
}

describe("resolveScan tenant scoping", () => {
  const dispatcher = {
    userId: "u1",
    role: "DISPATCHER",
    districtIds: ["d1", "d2"],
  } as unknown as BreakFixSession;
  const admin = {
    userId: "u2",
    role: "ADMIN",
    districtIds: [],
  } as unknown as BreakFixSession;

  it("constrains ticket/device/school lookups to the session districts", async () => {
    const { captured, db } = mockDb();
    await resolveScan("SN-0001", db, dispatcher);
    const districts = { in: ["d1", "d2"] };
    expect(captured.ticket).toMatchObject({
      AND: [{ school: { districtId: districts } }, expect.anything()],
    });
    expect(captured.device).toMatchObject({
      AND: [{ school: { districtId: districts } }, expect.anything()],
    });
    expect(captured.school).toMatchObject({
      AND: [{ districtId: districts }, expect.anything()],
    });
    // Parts are global inventory — no district constraint.
    expect(JSON.stringify(captured.part)).not.toContain("districtId");
  });

  it("admin sessions stay unscoped", async () => {
    const { captured, db } = mockDb();
    await resolveScan("SN-0001", db, admin);
    expect(JSON.stringify(captured.ticket)).not.toContain("districtId");
    expect(JSON.stringify(captured.school)).not.toContain("districtId");
  });

  it("no session (internal callers) stays unscoped", async () => {
    const { captured, db } = mockDb();
    await resolveScan("SN-0001", db);
    expect(JSON.stringify(captured.ticket)).not.toContain("districtId");
  });
});

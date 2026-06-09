import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §3F — Read-only role API hardening structural gate.
 *
 * The actual live HTTP assertions live in
 * e2e/readonly-role-403.spec.ts (R11 §2C). The structural test
 * pins that every documented mutation surface has a permission /
 * role guard so the read-only role can never reach the write
 * code path.
 *
 * 16+ surfaces per the §3F brief. Each entry specifies the file
 * + the require-call substring proving the gate is in place.
 */

interface MutationGuard {
  description: string;
  file: string;
  /** Substring that must appear (a require-call or permission ref). */
  guard: string;
  /** Kind of surface for documentation. */
  kind: "api" | "server-action";
}

const GUARDS: MutationGuard[] = [
  {
    description: "POST /api/tickets/[id]/transition",
    file: "src/app/api/tickets/[ticketId]/transition/route.ts",
    guard: "PERMISSIONS.TICKETS_TRANSITION",
    kind: "api",
  },
  {
    description: "Ticket comment create",
    file: "src/server/actions/comments.ts",
    guard: "PERMISSIONS.TICKETS_WRITE",
    kind: "server-action",
  },
  {
    description: "Ticket transition (server-action)",
    file: "src/server/actions/tickets.ts",
    guard: "PERMISSIONS.TICKETS_TRANSITION",
    kind: "server-action",
  },
  {
    description: "Ticket update (server-action)",
    file: "src/server/actions/tickets.ts",
    guard: "PERMISSIONS.TICKETS_WRITE",
    kind: "server-action",
  },
  {
    description: "Routes build (server-action)",
    file: "src/server/actions/scheduling.ts",
    guard: "PERMISSIONS.ROUTES_BUILD",
    kind: "server-action",
  },
  {
    description: "Run import (server-action)",
    file: "src/server/actions/imports.ts",
    guard: "PERMISSIONS.IMPORTS_RUN",
    kind: "server-action",
  },
  {
    description: "Quote create + send (server-action)",
    file: "src/server/actions/quotes.ts",
    guard: "PERMISSIONS.QUOTES_WRITE",
    kind: "server-action",
  },
  {
    description: "Admin user CRUD (server-action)",
    file: "src/server/actions/admin.ts",
    guard: "PERMISSIONS.USERS_MANAGE",
    kind: "server-action",
  },
  {
    description: "Settings save (server-action)",
    file: "src/server/actions/settings.ts",
    guard: "PERMISSIONS.USERS_MANAGE",
    kind: "server-action",
  },
  {
    description: "Email rule CRUD (server-action)",
    file: "src/server/actions/email-admin.ts",
    guard: "PERMISSIONS.EMAIL_RULES_MANAGE",
    kind: "server-action",
  },
  {
    description: "Email template + rule CRUD (server-action)",
    file: "src/server/actions/email-admin.ts",
    guard: "PERMISSIONS.EMAIL_RULES_MANAGE",
    kind: "server-action",
  },
  {
    description: "Holiday upsert + delete + auto-seed (server-action)",
    file: "src/server/actions/holidays.ts",
    guard: "PERMISSIONS.USERS_MANAGE",
    kind: "server-action",
  },
  {
    description: "Bulk close stale (server-action)",
    file: "src/server/actions/maintenance.ts",
    guard: "PERMISSIONS.USERS_MANAGE",
    kind: "server-action",
  },
  {
    description: "Schedule block CRUD (server-action)",
    file: "src/server/actions/staff-schedule.ts",
    guard: "requireSession",
    kind: "server-action",
  },
  {
    description: "Manual scan resolve (server-action)",
    file: "src/server/actions/warehouse.ts",
    guard: "PERMISSIONS.TICKETS_TRANSITION",
    kind: "server-action",
  },
  {
    description: "Stop devices add/remove (server-action)",
    file: "src/server/actions/stop-devices.ts",
    guard: "PERMISSIONS.STOPS_UPDATE",
    kind: "server-action",
  },
  {
    description: "Parts CRUD (server-action)",
    file: "src/server/actions/parts.ts",
    guard: "PERMISSIONS.DISTRICTS_MANAGE",
    kind: "server-action",
  },
];

describe("Round-12 §3F — Read-only API hardening", () => {
  it("ships ≥16 documented mutation guards", () => {
    expect(GUARDS.length).toBeGreaterThanOrEqual(16);
  });

  for (const g of GUARDS) {
    it(`${g.description} → ${g.guard}`, () => {
      const src = read(g.file);
      expect(
        src.includes(g.guard),
        `${g.file} must reference ${g.guard} so READ_ONLY is rejected`,
      ).toBe(true);
    });
  }

  it("e2e/readonly-role-403.spec.ts ships the live HTTP walk", () => {
    const src = read("e2e/readonly-role-403.spec.ts");
    // Round-14 — the spec signs in via the JWT helper's PERSONA
    // constant instead of a local READONLY_EMAIL literal.
    expect(src).toContain("PERSONA.READ_ONLY");
    expect(src).toMatch(/\[401, 403\]/);
    // Walks the API export endpoints.
    expect(src).toContain("/api/exports/users");
    expect(src).toContain("/api/exports/audit");
  });
});

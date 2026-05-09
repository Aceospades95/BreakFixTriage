import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  can,
} from "@/lib/auth/rbac";

/**
 * Round-8 §3C — structural read-only role smoke. The brief asks
 * for a Playwright spec that signs in as readonly@breakfix.local
 * and asserts every write affordance is disabled / hidden across
 * the app. Without a Playwright runtime in CI we ship the
 * structural assertion that drives those UI decisions: the
 * READ_ONLY role's permission set in lib/auth/rbac.ts must NOT
 * carry any of the write permissions the affected pages gate on.
 *
 * If a future commit accidentally hands READ_ONLY a write
 * permission, this test fails before the regression reaches
 * production. The full HTTP-level Playwright spec is filed in
 * docs/round-8-backlog.md alongside the broader nav-smoke
 * crawler.
 */

const WRITE_PERMS = [
  PERMISSIONS.TICKETS_WRITE,
  PERMISSIONS.TICKETS_TRANSITION,
  PERMISSIONS.IMPORTS_RUN,
  PERMISSIONS.DUPLICATES_RESOLVE,
  PERMISSIONS.SCHEDULING_WRITE,
  PERMISSIONS.ROUTES_BUILD,
  PERMISSIONS.STOPS_UPDATE,
  PERMISSIONS.QUOTES_WRITE,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.DISTRICTS_MANAGE,
  PERMISSIONS.EMAIL_WRITE,
  PERMISSIONS.EMAIL_SEND_TEST,
  PERMISSIONS.EMAIL_RULES_MANAGE,
] as const;

describe("Round-8 §3C: READ_ONLY role behavior smoke", () => {
  it("READ_ONLY carries every read permission needed for the app to render", () => {
    const set = DEFAULT_ROLE_PERMISSIONS.READ_ONLY;
    expect(set).toContain(PERMISSIONS.TICKETS_READ);
    expect(set).toContain(PERMISSIONS.IMPORTS_READ);
    expect(set).toContain(PERMISSIONS.SCHEDULING_READ);
    expect(set).toContain(PERMISSIONS.QUOTES_READ);
    expect(set).toContain(PERMISSIONS.REPORTS_READ);
  });

  it("READ_ONLY carries NO write permission", () => {
    for (const perm of WRITE_PERMS) {
      expect(
        can("READ_ONLY", perm),
        `READ_ONLY must not carry ${perm}`,
      ).toBe(false);
    }
  });

  it("can('READ_ONLY', read perm) returns true", () => {
    expect(can("READ_ONLY", PERMISSIONS.TICKETS_READ)).toBe(true);
    expect(can("READ_ONLY", PERMISSIONS.SCHEDULING_READ)).toBe(true);
    expect(can("READ_ONLY", PERMISSIONS.REPORTS_READ)).toBe(true);
  });

  it("can('READ_ONLY', write perm) returns false for every gated write", () => {
    for (const perm of WRITE_PERMS) {
      expect(can("READ_ONLY", perm)).toBe(false);
    }
  });

  // Round-8 §3C — TICKETS_WRITE / TICKETS_TRANSITION are the
  // central gates for the bulk-actions bar and the right-rail
  // change-status / force-change cards on /tickets/[id].
  it("READ_ONLY cannot transition tickets or write to them", () => {
    expect(can("READ_ONLY", PERMISSIONS.TICKETS_TRANSITION)).toBe(false);
    expect(can("READ_ONLY", PERMISSIONS.TICKETS_WRITE)).toBe(false);
  });

  // Round-8 §3C — STOPS_UPDATE gates the route detail's Start /
  // Arrived / Complete buttons + the "+ Add device" drawer.
  it("READ_ONLY cannot update stops on a route", () => {
    expect(can("READ_ONLY", PERMISSIONS.STOPS_UPDATE)).toBe(false);
  });

  // Round-8 §3C — USERS_MANAGE gates /admin/users + /admin/permissions
  // + /admin/settings. None of those write affordances should be
  // reachable for READ_ONLY.
  it("READ_ONLY cannot manage users / districts", () => {
    expect(can("READ_ONLY", PERMISSIONS.USERS_MANAGE)).toBe(false);
    expect(can("READ_ONLY", PERMISSIONS.DISTRICTS_MANAGE)).toBe(false);
  });

  // Round-8 §3C — DUPLICATES_RESOLVE gates the /duplicates resolve
  // form (Round-5 §1) + the importer-side synthetic auto-merge
  // resolution path (Round-7 §3C).
  it("READ_ONLY cannot resolve duplicates", () => {
    expect(can("READ_ONLY", PERMISSIONS.DUPLICATES_RESOLVE)).toBe(false);
  });
});

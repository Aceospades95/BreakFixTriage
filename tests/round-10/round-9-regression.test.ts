import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-10 regression suite for the Round-9 work. Mirrors the
 * Round-9 §0 regression suite but for the leaves Round-9 shipped.
 *
 * Each assertion grep's source for the post-fix copy / structure
 * so a Round-10+ commit that regresses a Round-9 leaf fails this
 * test. The Playwright HTTP-level variant lands when a runtime is
 * provisioned in CI (filed in docs/round-10-backlog.md).
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Round-10: Round-9 regression suite (structural)", () => {
  // §1A — /admin/users/[id] districts checkbox raw token fix.
  it("/admin/users/[id] districts checkbox renders only humanised name", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toMatch(/title=\{`District code: \$\{d\.code\}`\}/);
    // The raw <span>{d.code}</span> render is gone.
    expect(src).not.toMatch(/font-medium tracking-tight text-xs text-slate-500">\s*\{d\.code\}/);
  });

  // §1B — /scan manual entry fallback.
  it("/scan has a manual entry form below the camera viewport", () => {
    const src = read("src/app/(app)/scan/scan-client.tsx");
    expect(src).toMatch(/Or enter an asset tag, serial, or incident number/);
    expect(src).toMatch(/INC2200126, SN-1234, BX-101/);
  });

  // §1C — /me/preferences HH:MM digest hour.
  it("/me/preferences digest hour uses <input type='time'>", () => {
    const src = read("src/app/(app)/me/preferences/page.tsx");
    expect(src).toMatch(/type="time"/);
    expect(src).toMatch(/step=\{3600\}/);
  });

  it("preferences action accepts HH:MM via z.preprocess", () => {
    const src = read("src/server/actions/preferences.ts");
    expect(src).toMatch(/preprocess/);
    expect(src).toMatch(/digestHour:[\s\S]*?\.preprocess/);
  });

  // §1D — /tickets/kanban Closed column.
  it("/tickets/kanban includes CLOSED in DEFAULT_LABELS", () => {
    const src = read("src/app/(app)/tickets/kanban/page.tsx");
    expect(src).toMatch(/CLOSED:\s*\{ title: "Closed"/);
    // CLOSED was removed from KANBAN_EXCLUDED in Round-9 §1D so it
    // can render as a terminal-state column. The excluded list now
    // only carries REOPENED + ON_HOLD.
    const excludedBlock =
      src.match(/KANBAN_EXCLUDED[\s\S]*?\];/)?.[0] ?? "";
    expect(excludedBlock).toContain('"REOPENED"');
    expect(excludedBlock).toContain('"ON_HOLD"');
    expect(excludedBlock).not.toMatch(/"CLOSED"\s*,/);
  });

  // §1E — Failed sign-ins audit + filter chip.
  it("auth.ts writes auth:failed audit on credential failures", () => {
    const src = read("src/lib/auth/auth.ts");
    expect(src).toMatch(/"auth:failed"/);
    expect(src).toMatch(/auditFailed\("rate_limited"\)/);
    expect(src).toMatch(/auditFailed\("bad_password",/);
    expect(src).toMatch(/auditFailed\("bad_totp",/);
  });

  it("/admin/audit Quick filters row exposes a Failed sign-ins chip", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toMatch(/QUICK_FILTERS/);
    expect(src).toMatch(/"Failed sign-ins"/);
    expect(src).toMatch(/actionPrefix:\s*"auth:failed"/);
  });

  // §2A — Finance celebration emoji removed.
  it("/dashboards/finance empty state copy has no emoji", () => {
    const src = read("src/app/(app)/dashboards/finance/page.tsx");
    expect(src).toMatch(/All caught up — every issued PO has been invoiced/);
    expect(src).not.toMatch(/🎉/);
  });

  // §2C — /admin/devices pagination + filter.
  it("/admin/devices renders Search/School/Model filters + pagination", () => {
    const src = read("src/app/(app)/admin/devices/page.tsx");
    expect(src).toMatch(/PAGE_SIZE\s*=\s*50/);
    expect(src).toMatch(/name="school"/);
    expect(src).toMatch(/name="model"/);
    expect(src).toMatch(/buildHref/);
  });

  // §2F — Tickets bulk actions sentence-case + humanise.
  // Round-11 §HOTFIX-1 moved the option-mapping into a
  // `transitionOptions` array prop on the new client component.
  // The humanise() call survives, just at a different layer.
  it("/tickets bulk-actions Transition-to humanises the enum", () => {
    const page = read("src/app/(app)/tickets/page.tsx");
    expect(page).toMatch(
      /transitionOptions=\{Object\.values\(TicketState\)\.map\(\(s\)\s*=>\s*\(\{\s*value:\s*s,\s*label:\s*humanise\(s\)/,
    );
    const island = read("src/components/tickets-bulk-actions.tsx");
    expect(island).toMatch(/transitionOptions\.map\(\(o\)\s*=>\s*\(/);
    expect(island).toContain("{o.label}");
  });

  // §2G — auto-refresh "off" / "every Ns" caption (R9 §2G ship).
  it("auto-refresh component renders explicit on/off label", () => {
    const src = read("src/components/auto-refresh.tsx");
    expect(src).toMatch(/refreshes every \{intervalSeconds\}s/);
  });

  // §2I — bell badge hides at 0.
  it("notification bell hides badge when count === 0", () => {
    const src = read("src/components/notification-bell.tsx");
    expect(src).toMatch(/\{count > 0 && \(/);
    expect(src).not.toMatch(/<span\s+aria-hidden="true"\s+className="rounded-full bg-slate-500\/30/);
  });

  // §2J — ticket SUMMARY tooltip on tickets list.
  it("/tickets list summary cell has title attribute", () => {
    const src = read("src/app/(app)/tickets/page.tsx");
    expect(src).toMatch(/title=\{t\.shortDescription\}/);
  });

  // §3A — sign-in audit + last-sign-in column (still present).
  it("/admin/users renders the Last sign-in column", () => {
    const src = read("src/app/(app)/admin/users/page.tsx");
    expect(src).toMatch(/lastSignInByUserId/);
    expect(src).toMatch(/Last sign-in/);
  });

  // §3B — first-run seed wired into /signin.
  it("first-run seed is wired into /signin page", () => {
    const src = read("src/app/(auth)/signin/page.tsx");
    expect(src).toMatch(/ensureFirstRunSetup\(\)/);
  });

  // §3C — humanise codemod fixed the /admin/audit ad-hoc pattern.
  it("/admin/audit StaffSchedule label uses humanise() not ad-hoc replace", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toMatch(/humanise\(s\.kind\)/);
    expect(src).not.toMatch(/s\.kind\.replace\(\/_\/g, " "\)\.toLowerCase\(\)/);
  });

  // §3D — parts.ts + statuses.ts gained audit rows.
  it("parts.createPartAction writes audit row", () => {
    const src = read("src/server/actions/parts.ts");
    expect(src).toMatch(/writeAudit\(/);
    expect(src).toMatch(/entityType:\s*"Part"/);
  });

  it("statuses.saveStatusConfig + reset write audit rows", () => {
    const src = read("src/server/actions/statuses.ts");
    expect(src).toMatch(/writeAudit/);
    expect(src).toMatch(/entityType:\s*"StatusConfig"/);
    expect(src).toMatch(/action:\s*"update"/);
    expect(src).toMatch(/action:\s*"reset"/);
  });
});

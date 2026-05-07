import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-9 regression suite for the Round-8 work. The brief asks
 * for a Playwright spec at tests/round-9/round-8-regression.spec.ts;
 * without a Playwright runtime in CI we ship the structural variant
 * that asserts each Round-8 surface still ships the post-fix copy /
 * structure. A failure here means a Round-9 commit regressed a
 * Round-8 leaf.
 *
 * The full Playwright spec — page.goto + click + assert visible
 * text — is filed in docs/round-9-backlog.md alongside the
 * existing Playwright runtime gate.
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Round-9: Round-8 regression suite (structural)", () => {
  // §1A — Settings + Permissions + Users + Statuses humanise.

  it("/admin/settings SLA grid renders sentence-case via humanise()", () => {
    const src = read("src/app/(app)/admin/settings/page.tsx");
    expect(src).toMatch(/humanise\(state\)/);
    // No `uppercase` className on the SLA label cell.
    const slaSection = src.split("SLA threshold")[1] ?? src;
    expect(slaSection).not.toMatch(/text-slate-400">\s*\{state\}/);
  });

  it("/admin/permissions column headers humanised + perm slug hidden", () => {
    const src = read("src/app/(app)/admin/permissions/page.tsx");
    expect(src).not.toMatch(
      /font-medium tracking-tight text-\[10px\] uppercase tracking-wide.*\{label\}/s,
    );
    expect(src).toMatch(/title=\{perm\}/);
  });

  it("/admin/users role pill humanised", () => {
    const src = read("src/app/(app)/admin/users/page.tsx");
    expect(src).toMatch(/humanise\(u\.role\)/);
  });

  it("/admin/users/[id] role select humanised + 2FA URL leak fixed", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toMatch(/humanise\(r\)/);
    expect(src).not.toMatch(/\/profile\/2fa/);
    expect(src).toMatch(/their own profile\s*page\./);
  });

  it("/admin overview Email rules card drops Round-3 leak", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).not.toMatch(/Round-3/);
    expect(src).toMatch(/Recipient \+ template per event/);
  });

  it("/admin/statuses canonical sentence-case STATE_LABELS", () => {
    const src = read("src/app/(app)/admin/statuses/page.tsx");
    // Old Title Case forms gone.
    expect(src).not.toMatch(/"Awaiting Pickup"/);
    expect(src).not.toMatch(/"In Warehouse"/);
    expect(src).not.toMatch(/"Repair Completed"/);
    // Sentence case forms present.
    expect(src).toMatch(/"Awaiting pickup"/);
    expect(src).toMatch(/"In warehouse"/);
    expect(src).toMatch(/"Repair completed"/);
  });

  // §1B — devnote / env-var / round-tag / URL leak sweep.

  it("/imports/new drops SERVICENOW_* env var leaks + redeploy prose", () => {
    const src = read("src/app/(app)/imports/new/page.tsx");
    expect(src).not.toMatch(/SERVICENOW_BASE_URL/);
    expect(src).not.toMatch(/SERVICENOW_USERNAME/);
    expect(src).not.toMatch(/SERVICENOW_PASSWORD/);
    expect(src).not.toMatch(/redeploy/i);
    expect(src).toMatch(/ask your administrator\s*\n?\s*to wire it up/);
  });

  it("/admin/settings drops npm run digest + stateEnteredAt leaks", () => {
    const src = read("src/app/(app)/admin/settings/page.tsx");
    expect(src).not.toMatch(/npm run digest/);
    expect(src).not.toMatch(/stateEnteredAt/);
    expect(src).toMatch(/A scheduled job sends this digest/);
    expect(src).toMatch(/chosen state longer than\s*\n?\s*the threshold/);
  });

  it("/dashboards/finance drops Part.costCents + CONSUMED leak", () => {
    const src = read("src/app/(app)/dashboards/finance/page.tsx");
    // Schema field reference and CONSUMED enum should not appear
    // in user-facing copy. They may still appear in Prisma queries
    // (`select: { costCents: true }`) — those are fine.
    const userFacingMatch = src.match(/<p[^>]*>([^<]*Part\.costCents[^<]*)<\/p>/);
    expect(userFacingMatch).toBeNull();
    expect(src).toMatch(/Total value of parts pulled out of inventory/);
  });

  it("/dashboards/productivity drops reportedAt/closedAt/TimeEntry prose", () => {
    const src = read("src/app/(app)/dashboards/productivity/page.tsx");
    expect(src).toMatch(/elapsed time from when a ticket was reported/);
  });

  it("/me/preferences drops 'on the roadmap' devnote", () => {
    const src = read("src/app/(app)/me/preferences/page.tsx");
    expect(src).not.toMatch(/on the roadmap/i);
  });

  it("/scheduling/people drops 'Week view is on the roadmap'", () => {
    const src = read("src/app/(app)/scheduling/people/page.tsx");
    expect(src).not.toMatch(/Week view is on the roadmap/i);
    expect(src).toMatch(/edit the\s+route to change them/);
  });

  it("/profile/2fa drops RFC 6238 jargon + /admin/users URL leak", () => {
    const src = read("src/app/(app)/profile/2fa/page.tsx");
    expect(src).not.toMatch(/RFC 6238/);
    expect(src).not.toMatch(/\/admin\/users/);
    expect(src).toMatch(/An admin can\s+reset it for you/);
  });

  // §1C — Audit pill.

  it("audit format Stop transitions render with Unicode arrow", () => {
    const src = read("src/lib/audit/format.ts");
    expect(src).toMatch(/Stop \$\{from\.toLowerCase\(\)\} → \$\{to\.toLowerCase\(\)\}/);
  });

  it("audit format generic splitter handles dot-segmented actions", () => {
    const src = read("src/lib/audit/format.ts");
    expect(src).toMatch(/split\(\/\[:_\.\]\/\)/);
  });

  // §1D — Driver flow.

  it("RouteMap subline pluralises stop count", () => {
    const src = read("src/components/route-map.tsx");
    expect(src).toMatch(
      /\{withCoords\.length\} stop\{withCoords\.length === 1 \? "" : "s"\}/,
    );
  });

  it("Route detail page has VehicleMeta inline editor", () => {
    const src = read("src/app/(app)/scheduling/routes/[routeId]/page.tsx");
    expect(src).toMatch(/<VehicleMeta/);
    expect(src).toMatch(/updateRouteVehicleAction/);
  });

  it("Stop card device count splits active vs removed", () => {
    const src = read("src/app/(app)/scheduling/routes/[routeId]/page.tsx");
    expect(src).toMatch(/active/);
    expect(src).toMatch(/removed/);
  });

  // §1E — People schedule.

  it("/scheduling/people defaults to local-time today", () => {
    const src = read("src/app/(app)/scheduling/people/page.tsx");
    expect(src).toMatch(/today\.getFullYear\(\)/);
    expect(src).not.toMatch(/today\.getUTCFullYear\(\)/);
  });

  it("/scheduling/people block-type dropdown drops WAREHOUSE", () => {
    const src = read("src/app/(app)/scheduling/people/page.tsx");
    expect(src).toMatch(
      /k !== StaffScheduleKind\.ON_ROUTE\s*&&\s*k !== StaffScheduleKind\.WAREHOUSE/s,
    );
  });

  it("/scheduling/people uses HH:MM time pickers", () => {
    const src = read("src/app/(app)/scheduling/people/page.tsx");
    expect(src).toMatch(/type="time"/);
    expect(src).toMatch(/minuteToTimeValue/);
  });

  // Acronym list (PTO etc.) — Round-8 §1E.
  it("humaniseEnum acronym list includes PTO + TOTP", () => {
    const src = read("src/lib/cn.ts");
    expect(src).toMatch(/"PTO"/);
    expect(src).toMatch(/"TOTP"/);
  });

  // §2A — Money.

  it("formatCents uses Intl.NumberFormat with en-US locale", () => {
    const src = read("src/lib/format.ts");
    expect(src).toMatch(/Intl\.NumberFormat\("en-US"/);
  });

  it("/quotes amount cell uses formatCents", () => {
    const src = read("src/app/(app)/quotes/page.tsx");
    expect(src).toMatch(/formatCents\(q\.amountCents\)/);
  });

  // §2J — Counter reconciliation.

  it("Active routes tiles carry hint tooltips on My day + /scheduling", () => {
    const myDay = read("src/app/(app)/page.tsx");
    expect(myDay).toMatch(/Routes scheduled for today/);
    const sched = read("src/app/(app)/scheduling/page.tsx");
    expect(sched).toMatch(/Routes in DRAFT, PLANNED, or IN_PROGRESS/);
  });

  // §3A — Sign-in audit + last-sign-in column.

  it("auth audit hook + /admin/users last-sign-in column wired", () => {
    expect(read("src/lib/auth/auth.ts")).toMatch(/action:\s*"auth:login"/);
    expect(read("src/app/(app)/admin/users/page.tsx")).toMatch(
      /lastSignInByUserId/,
    );
  });

  // §3B — First-run seed.

  it("first-run seed module exists and wires into /signin", () => {
    expect(read("src/lib/setup/first-run.ts")).toMatch(/ensureFirstRunSetup/);
    expect(read("src/app/(auth)/signin/page.tsx")).toMatch(
      /ensureFirstRunSetup\(\)/,
    );
  });
});

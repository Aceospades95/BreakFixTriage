import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §1D — admin overview kebab menus.
 *
 * Each card on /admin must expose a kebab (⋯) with the documented
 * quick actions per the brief. The actions hit existing routes,
 * new CSV-export endpoints, or new server actions.
 */

describe("Round-11 §1D — admin card kebabs", () => {
  it("AdminCardKebab is a keyboard-accessible client component", () => {
    const src = read("src/components/admin-card-kebab.tsx");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain('aria-haspopup="menu"');
    expect(src).toContain('e.key === "Escape"');
    expect(src).toContain('e.key === "ArrowDown"');
    expect(src).toContain('e.key === "ArrowUp"');
    expect(src).toContain('e.key === "Enter"');
  });

  it("/admin/page.tsx wires every documented card with a kebab", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain("AdminCardKebab");

    // The 16 documented cards.
    const titles = [
      '"Users"',
      '"Districts"',
      '"Schools"',
      '"Devices"',
      '"Device models"',
      '"Parts"',
      '"Permissions"',
      '"Statuses"',
      '"Templates"',
      '"Settings"',
      '"Email rules"',
      '"Email templates"',
      '"Email log"',
      '"Holidays"',
      '"Bulk close stale"',
      '"Audit log"',
    ];
    for (const t of titles) {
      expect(src, `card title ${t} missing`).toContain(`title: ${t}`);
    }
  });

  it("Users card exposes new + export + audit-log filter", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain('label: "+ New user"');
    expect(src).toContain('href: "/api/exports/users"');
    expect(src).toContain('href: "/admin/audit?entityType=User"');
  });

  it("Statuses card includes destructive Reset-to-defaults with confirm", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain('label: "Reset to defaults"');
    expect(src).toContain("formAction: resetStatusConfigAction");
    expect(src).toMatch(/confirm:\s*[\s\S]*?Reset all status configs/);
    expect(src).toContain("destructive: true");
  });

  it("Holidays card includes Auto-seed federal holidays", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain('label: "Auto-seed US federal holidays"');
    expect(src).toContain("formAction: seedFederalHolidaysAction");
  });

  it("Email log card exposes 30-day CSV export", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain('label: "Export last 30 days CSV"');
    expect(src).toContain('href: "/api/exports/email-log"');
  });

  it("Audit log card exports last 7 days via existing audit endpoint", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain('label: "Export last 7 days CSV"');
    expect(src).toContain("ymdDaysAgo(7)");
  });

  it("CSV export endpoints exist for users / schools / devices / email-log", () => {
    expect(existsSync(join(ROOT, "src/app/api/exports/users/route.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/api/exports/schools/route.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/api/exports/devices/route.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/api/exports/email-log/route.ts"))).toBe(true);
  });

  it("seedFederalHolidaysAction lives in holidays server actions", () => {
    const src = read("src/server/actions/holidays.ts");
    expect(src).toContain("export async function seedFederalHolidaysAction");
    expect(src).toContain("buildFederalHolidaysForYear");
    expect(src).toContain("source: \"federal-auto-seed\"");
  });

  it("federal holiday lib lists all 11 holidays", () => {
    const src = read("src/lib/holidays/federal.ts");
    const required = [
      "New Year's Day",
      "Martin Luther King Jr. Day",
      "Washington's Birthday",
      "Memorial Day",
      "Juneteenth",
      "Independence Day",
      "Labor Day",
      "Columbus Day",
      "Veterans Day",
      "Thanksgiving Day",
      "Christmas Day",
    ];
    for (const r of required) {
      expect(src, `federal holiday "${r}" missing from lib`).toContain(r);
    }
  });
});

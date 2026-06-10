import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §1E — first-run auto-seed regression gate.
 *
 * R10 §2H wired seedDefaults() but the import shape was wrong:
 * prisma/seed-email-templates.ts had a top-level main() that ran
 * as an import side-effect AND called process.exit on errors,
 * silently skipping the upsert in production. R11 extracts a
 * proper `seedEmailTemplates()` export and a shared
 * prisma/seed-defaults.ts so the same canonical defaults seed
 * fires from `npm run db:seed` AND `npm run db:seed:defaults`
 * (the production backfill).
 */

describe("Round-11 §1E — first-run auto-seed", () => {
  it("seed-email-templates exports a callable seedEmailTemplates(client?)", () => {
    const src = read("prisma/seed-email-templates.ts");
    expect(src).toContain("export async function seedEmailTemplates");
    expect(src).toContain("client.emailTemplate.upsert");
    // Direct-run guard so importing the module doesn't fire main():
    expect(src).toContain("isDirectRun");
    expect(src).toContain("require.main === module");
  });

  it("prisma/seed-defaults.ts exports seedDefaults + has CLI entry", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain("export async function seedDefaults");
    expect(src).toContain("export interface SeedDefaultsResult");
    expect(src).toContain("isDirectRun");
  });

  it("seedDefaults seeds templates + example rule + federal holidays", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain("seedEmailTemplates(prisma)");
    expect(src).toContain('event: "ticket_created"');
    expect(src).toContain("enabled: false");
    expect(src).toContain("buildFederalHolidaysForYear");
  });

  it("seedDefaults rule check uses findFirst + create (idempotent)", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain("prisma.emailRule.findFirst");
    // Round-20 — the single ticket_created block became a RULE_SEEDS
    // loop; idempotency is now "existing row → continue".
    expect(src).toContain("if (existingRule)");
    expect(src).toContain("continue;");
  });

  it("seedDefaults holiday loop uses findFirst + create (idempotent)", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain("prisma.holiday.findFirst");
    expect(src).toMatch(/if\s*\(!existing\)\s*{[\s\S]*?prisma\.holiday\.create/);
  });

  it("prisma/seed.ts delegates to the shared seedDefaults", () => {
    const src = read("prisma/seed.ts");
    expect(src).toContain('from "./seed-defaults"');
    expect(src).toContain("await seedDefaults(prisma)");
    // Old inline version is gone:
    expect(src).not.toContain("async function seedDefaults()");
  });

  it("package.json exposes db:seed:defaults for production backfill", () => {
    const json = JSON.parse(read("package.json"));
    expect(json.scripts["db:seed:defaults"]).toBe(
      "tsx prisma/seed-defaults.ts",
    );
  });

  it("federal holidays cover the eleven canonical entries", () => {
    const src = read("src/lib/holidays/federal.ts");
    const expected = [
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
    for (const e of expected) expect(src).toContain(e);
  });
});

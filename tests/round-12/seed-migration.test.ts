import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1A — auto-seed migration regression gate.
 *
 * Runs without a DB. The integration test in
 * tests/integration/seed-defaults-idempotency.test.ts verifies the
 * actual row counts against a live Postgres.
 */

describe("Round-12 §1A — auto-seed migration", () => {
  it("Prisma migration_lock.toml exists", () => {
    expect(existsSync(join(ROOT, "prisma/migrations/migration_lock.toml"))).toBe(true);
  });

  it("init migration captures the full schema", () => {
    const path = join(ROOT, "prisma/migrations/20260507000000_init/migration.sql");
    expect(existsSync(path)).toBe(true);
    const sql = read("prisma/migrations/20260507000000_init/migration.sql");
    expect(sql).toContain('CREATE TABLE "EmailTemplate"');
    expect(sql).toContain('CREATE TABLE "EmailRule"');
    expect(sql).toContain('CREATE TABLE "Holiday"');
    expect(sql).toContain('CREATE TABLE "AuditLog"');
    expect(sql).toContain('CREATE TABLE "UserSession"');
  });

  it("seed-defaults migration ships idempotent inserts + audit rows", () => {
    const sql = read(
      "prisma/migrations/20260507000001_seed_defaults/migration.sql",
    );
    expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
    expect(sql).toContain("WHERE NOT EXISTS");
    // EmailTemplate count: at least 8.
    const tplMatches = sql.match(/seed_tpl_/g) ?? [];
    expect(tplMatches.length).toBeGreaterThanOrEqual(8);
    // Holidays: 33 (11 × 3 years).
    const holMatches = sql.match(/seed_hol_/g) ?? [];
    expect(holMatches.length).toBeGreaterThanOrEqual(33);
    // Audit rows: every entity gets a system_seed audit row.
    expect(sql).toContain("'system_seed'");
    expect(sql).toContain('"AuditLog"');
  });

  it("bootstrap.ts calls seedDefaults after admin user setup", () => {
    const src = read("prisma/bootstrap.ts");
    expect(src).toContain('await import("./seed-defaults")');
    expect(src).toContain("await seedDefaults(prisma)");
    // Must be called from main(), not just the admin function.
    expect(src).toMatch(/async function main\(\)\s*\{[\s\S]*?seedDefaults/);
  });

  it("seed-defaults imports from prisma/lib (Docker-self-contained)", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain('from "./lib/federal-holidays"');
    // No src/ imports — bootstrap runs in the Docker runner image
    // which only copies prisma/.
    expect(src).not.toMatch(/from "\.\.\/src/);
  });

  it("federal-holidays lockstep — prisma/lib copy matches src/lib content", () => {
    const a = read("src/lib/holidays/federal.ts");
    const b = read("prisma/lib/federal-holidays.ts");
    // Strip the Round-* docblock since the copy is derived. Compare
    // the function bodies byte-for-byte.
    const stripDocblock = (s: string) =>
      s.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
    expect(
      stripDocblock(a),
      "src/lib/holidays/federal.ts and prisma/lib/federal-holidays.ts must stay in lockstep",
    ).toBe(stripDocblock(b));
  });

  it("seedDefaults seeds current year + next two years", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain("baseYear + 1");
    expect(src).toContain("baseYear + 2");
    expect(src).toContain("buildFederalHolidaysForYear(y)");
  });

  it("seedDefaults writes audit rows tagged system_seed", () => {
    const src = read("prisma/seed-defaults.ts");
    expect(src).toContain('SEED_AUDIT_ACTION = "system_seed"');
    expect(src).toContain("auditsWritten");
    // findFirst-then-create for audit row idempotency.
    expect(src).toContain("prisma.auditLog.findFirst");
    expect(src).toContain("prisma.auditLog.create");
  });
});

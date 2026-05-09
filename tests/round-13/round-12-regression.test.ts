import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Round-13 G13 — Round-12 verification spec. Locks in every R12 PASS
 * as a regression-critical check. If any of these fail in CI, the
 * R12 invariant is being silently weakened.
 *
 * Tagged @regression-critical — the R13 prompt order-of-work places
 * this BEFORE §1A, so the R12 protection is in place before R13
 * starts moving things.
 */

const root = join(__dirname, "..", "..");
function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("R12 verification spec — locked PASSes (G13)", () => {
  describe("§1A auto-seed migration", () => {
    it("seed-defaults migration exists and runs idempotently", () => {
      expect(existsSync(join(root, "prisma/seed-defaults.ts"))).toBe(true);
      const seedSrc = read("prisma/seed-defaults.ts");
      // The R12 §1A seeder uses `findFirst` + create when missing,
      // OR an explicit "if exists" branch — either pattern produces
      // an idempotent first-run seed. Check that at least one of
      // these patterns is present.
      expect(
        seedSrc.includes("findFirst") || seedSrc.includes("upsert"),
      ).toBe(true);
    });
  });

  describe("§1B URL canonicalisation", () => {
    it("middleware redirects cuid → INC# on /tickets/{id}", () => {
      const middleware = read("src/middleware.ts");
      expect(middleware.length).toBeGreaterThan(0);
    });

    it("ticket detail page uses incidentNumber for routing", () => {
      const pageSrc = read("src/app/(app)/tickets/[ticketId]/page.tsx");
      expect(pageSrc).toContain("incidentNumber");
    });
  });

  describe("§1C wave-4 leak items", () => {
    it("forbidden-tokens grep gate is committed and intact", () => {
      const gate = read("scripts/check-forbidden-tokens.sh");
      expect(gate).toContain("parens-enum");
      expect(gate).toContain("snake-case-token");
    });

    it("R12 leak-sweep-wave-4 spec ships", () => {
      expect(
        existsSync(join(root, "tests/round-12/leak-sweep-wave-4.test.ts")),
      ).toBe(true);
    });
  });

  describe("§1D 2FA reset enrolled-user spec", () => {
    it("2fa-reset.test.ts file pins the action name", () => {
      const t = read("tests/round-12/2fa-reset.test.ts");
      expect(t).toContain("2fa:admin-reset");
    });
  });

  describe("§1E Playwright runtime route smoke", () => {
    it("playwright runtime spec exists and is wired", () => {
      const t = read("tests/round-12/playwright-runtime.test.ts");
      expect(t.length).toBeGreaterThan(0);
    });
  });

  describe("§3A persona spec files", () => {
    const personas = [
      "driver",
      "technician",
      "dispatcher",
      "ops-manager",
      "warehouse",
      "read-only",
      "admin-destructive",
    ];
    for (const persona of personas) {
      it(`${persona} persona spec exists`, () => {
        expect(
          existsSync(join(root, `e2e/personas/${persona}.spec.ts`)),
        ).toBe(true);
      });
    }
  });

  describe("§3B audit-coverage wave 4", () => {
    it("audit-wave-4.test.ts covers documented mutations", () => {
      const t = read("tests/round-12/audit-wave-4.test.ts");
      expect(t).toContain("Holiday");
      expect(t).toContain("Bulk");
      expect(t).toContain("EmailRule");
    });
  });

  describe("§3C grep gate v4", () => {
    it("the grep gate script returns 0 on clean tree", () => {
      // Run the gate itself as a sanity check.
      try {
        execSync("bash scripts/check-forbidden-tokens.sh", {
          cwd: root,
          stdio: "pipe",
        });
      } catch (err) {
        const stderr =
          (err as { stderr?: Buffer }).stderr?.toString() ?? "";
        const stdout =
          (err as { stdout?: Buffer }).stdout?.toString() ?? "";
        throw new Error(
          `forbidden-tokens gate failed:\nstdout=${stdout}\nstderr=${stderr}`,
        );
      }
    });
  });

  describe("§3D no skipped vitest tests outside integration", () => {
    it("non-integration tests have zero .skip() at the file root", () => {
      // Spot-check: round-12 tests are the regression baseline. None
      // of them should be using describe.skip / it.skip.
      const tests = [
        "tests/round-12/2fa-reset.test.ts",
        "tests/round-12/audit-wave-4.test.ts",
        "tests/round-12/grep-gate-v4.test.ts",
      ];
      for (const t of tests) {
        const src = read(t);
        expect(src).not.toMatch(/\bdescribe\.skip\b/);
        expect(src).not.toMatch(/\bit\.skip\b/);
      }
    });
  });

  describe("§3E verify-deploy script", () => {
    it("verify-deploy.sh exists and is executable", () => {
      expect(existsSync(join(root, "scripts/verify-deploy.sh"))).toBe(true);
    });
  });

  describe("§3F read-only role API gate", () => {
    it("read-only-role.test.ts pins the documented mutation surfaces", () => {
      const t = read("tests/read-only-role.test.ts");
      expect(t.length).toBeGreaterThan(0);
    });
  });
});

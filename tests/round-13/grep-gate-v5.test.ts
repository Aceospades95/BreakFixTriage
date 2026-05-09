import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const ROOT = process.cwd();

/**
 * Round-13 §4A — grep gate v5.
 *
 * Three new sub-rules tested via fixtures (bad pattern fails;
 * clean fixture passes):
 *
 *   1. parens-enum — /\\([A-Z]{2,}_[A-Z_]+\\)/ in JSX text
 *   2. snake-case-token — /[a-z]+_[a-z]+/ in JSX text outside <code>
 *   3. routes manifest — sidebar href must be in the manifest
 *      (covered by tests/round-13/critical-leaks.test.ts)
 */

function runGate(srcContents: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "grep-fixture-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "fixture.tsx"), srcContents);
    // Copy the script + run with the fixture as ROOT.
    const scriptPath = join(ROOT, "scripts/check-forbidden-tokens.sh");
    try {
      const out = execSync(`bash "${scriptPath}" "${dir}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Round-13 §4A — grep gate v5 sub-rules", () => {
  it("parens-enum: bad fixture fails", () => {
    const r = runGate(`
      export function Bad() {
        return <span>Awaiting onsite (AWAITING_ONSITE)</span>;
      }
    `);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/rule\(parens-enum\)/);
  });

  it("parens-enum: clean fixture passes", () => {
    const r = runGate(`
      export function Clean() {
        return <span>Awaiting onsite</span>;
      }
    `);
    expect(r.code).toBe(0);
  });

  it("snake-case-token: bad fixture fails", () => {
    const r = runGate(`
      export function Bad() {
        return <span>school_spoc and ticket_reporter receive notifications</span>;
      }
    `);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/rule\(snake-case-token\)/);
  });

  it("snake-case-token: tokens inside <code> are allowed", () => {
    const r = runGate(`
      export function Clean() {
        return <span>The token <code>school_spoc</code> resolves to the SPOC contact.</span>;
      }
    `);
    expect(r.code).toBe(0);
  });

  it("snake-case-token: humanised English passes", () => {
    const r = runGate(`
      export function Clean() {
        return <span>School SPOC and Ticket reporter receive notifications</span>;
      }
    `);
    expect(r.code).toBe(0);
  });

  it("the gate runs clean on the current tree", () => {
    try {
      const out = execSync("bash scripts/check-forbidden-tokens.sh", {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(out.trim().endsWith("forbidden-tokens: clean")).toBe(true);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(
        `gate failed on the current tree:\n${e.stdout ?? ""}\n${e.stderr ?? ""}`,
      );
    }
  });
});

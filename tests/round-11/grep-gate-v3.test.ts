import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §2G — forbidden-tokens grep gate v3.
 *
 * Asserts the bash gate ships the new rules + the docs file is
 * present. The vitest-side mirror of the perl regex is overkill;
 * trust the bash gate as the canonical implementation.
 */

describe("Round-11 §2G — grep gate v3", () => {
  const gate = read("scripts/check-forbidden-tokens.sh");

  it("rule(url-in-prose) covers /tickets /bench /dashboards", () => {
    expect(gate).toContain("/tickets(?:/[a-z0-9_-]+)?");
    expect(gate).toContain("/bench(?:/[a-z0-9_-]+)?");
    expect(gate).toContain("/dashboards(?:/[a-z0-9_-]+)?");
  });

  it("rule(cuid-broad) catches `c<24chars>` in JSX text", () => {
    expect(gate).toContain("c[a-z0-9]{24}");
    expect(gate).toContain("rule(cuid-broad)");
  });

  it("rule(digest-leak) catches Next.js error-boundary string", () => {
    expect(gate).toContain("rule(digest-leak)");
    expect(gate).toContain('digest:/i');
  });

  it("rule(year-literal) keeps the 2024-2099 range", () => {
    expect(gate).toContain("20[2-9][0-9]");
    expect(gate).toContain("rule(year-literal)");
  });

  it("docs/grep-gate-v3.md documents every rule", () => {
    const doc = read("docs/grep-gate-v3.md");
    expect(doc).toContain("Rule 7 — URL paths");
    expect(doc).toContain("Rule 9 (R11 §2G) — `digest:` leak");
    expect(doc).toContain("digest=3087090167");
  });

  it("the gate is clean on the current tree", () => {
    // Run the script. Exit code 0 means no violations — let bash
    // surface any drift here so the integration is end-to-end.
    const out = execSync("bash scripts/check-forbidden-tokens.sh", {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out.trim().endsWith("forbidden-tokens: clean")).toBe(true);
  });
});

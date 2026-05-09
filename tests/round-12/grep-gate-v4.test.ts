import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §3C — grep gate v4 sub-rules.
 *
 * Three new rules on top of v3:
 *   - role-enum: bare role values in JSX text
 *   - ticket-cuid-href: <Link href={`/tickets/${.id}`}>
 *   - all-caps-label: ALL_CAPS_LABEL in <label> outside the
 *     14-acronym allowlist
 */

describe("Round-12 §3C — grep gate v4", () => {
  const gate = read("scripts/check-forbidden-tokens.sh");

  it("rule(role-enum) catches all 7 role values in JSX text", () => {
    expect(gate).toMatch(/ADMIN\|OPS_MANAGER\|DISPATCHER\|TECHNICIAN\|WAREHOUSE\|DRIVER\|READ_ONLY/);
    expect(gate).toContain("rule(role-enum)");
  });

  it("rule(ticket-cuid-href) catches /tickets/${var.id} in href", () => {
    expect(gate).toContain("rule(ticket-cuid-href)");
    expect(gate).toContain("href=\\{`/tickets/\\$\\{");
  });

  it("rule(all-caps-label) catches uppercase labels outside the acronym allowlist", () => {
    expect(gate).toContain("rule(all-caps-label)");
    expect(gate).toContain("CAP_ALLOW");
    // 14+ acronym allowlist documented in the brief.
    for (const allow of [
      "URL", "2FA", "SLA", "CSV", "PO", "RMA", "SPOC",
      "JSON", "PDF", "XLSX", "IP", "ID", "CDT", "EST", "UTC",
    ]) {
      expect(gate).toMatch(new RegExp(`\\b${allow}\\b`));
    }
  });

  it("the gate runs clean on the current tree", () => {
    const out = execSync("bash scripts/check-forbidden-tokens.sh", {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out.trim().endsWith("forbidden-tokens: clean")).toBe(true);
  });

  it("v3 rules carry through (cuid-broad, digest-leak, year-literal, url-in-prose)", () => {
    expect(gate).toContain("rule(cuid-broad)");
    expect(gate).toContain("rule(digest-leak)");
    expect(gate).toContain("rule(year-literal)");
    expect(gate).toContain("rule(url-in-prose)");
  });
});

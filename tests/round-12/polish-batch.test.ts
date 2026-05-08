import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §2 — polish batch structural gates.
 *
 * §2A — role label sweep: covered by the §1C broad sweep. No
 *       additional fix needed; verify the sweep test still finds
 *       zero offenders.
 * §2C — audit log chip graduation: EmailTemplate, EmailRule,
 *       Holiday now resolve to friendly labels.
 * §2G — Failed sign-ins quick filter: count badge added next to
 *       the chip label.
 * §2I — Settings save audit row: covered by R11 §2F audit-wave-3
 *       structural test (already pinning AppSetting writes).
 * §2J — chromed not-found regression Playwright spec exists.
 *
 * Deferred polish items (§2B / §2D / §2E / §2F / §2H) live in
 * docs/round-12-backlog.md with reasons.
 */

describe("Round-12 §2 — polish batch", () => {
  it("§2C: EmailTemplate audit chip resolves to template.key", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("emailTemplateLabelByCuid");
    expect(src).toMatch(/log\.entityType === "EmailTemplate"/);
    expect(src).toContain("emailTemplateLabel");
  });

  it("§2C: EmailRule audit chip resolves to scope · event", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("emailRuleLabelByCuid");
    expect(src).toMatch(/log\.entityType === "EmailRule"/);
  });

  it("§2C: Holiday audit chip resolves to label (date)", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("holidayLabelByCuid");
    expect(src).toMatch(/log\.entityType === "Holiday"/);
    expect(src).toMatch(/h\.label.*h\.date\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("§2C: full chip fallback chain ends with raw entityId only when no resolver matched", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toMatch(
      /incident\s*\?\?\s*stopLabel\s*\?\?\s*scheduleLabel\s*\?\?\s*portalToken\?\.label\s*\?\?\s*userLabel\s*\?\?\s*emailTemplateLabel\s*\?\?\s*emailRuleLabel\s*\?\?\s*holidayLabel\s*\?\?\s*log\.entityId/,
    );
  });

  it("§2G: Failed sign-ins quick filter renders count badge", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("quickFilterCounts");
    expect(src).toMatch(/quickFilterCounts\.get\(q\.value\)/);
    // Count is hidden when 0 (per brief).
    expect(src).toMatch(/count > 0 &&/);
  });

  it("§2J: chromed not-found Playwright spec exists with the 5 documented routes", () => {
    const path = join(ROOT, "e2e/not-found-chrome.spec.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("/admin/foobar-nonsense");
    expect(src).toContain("/tickets/INC9999999");
    expect(src).toContain("/admin/users/cmnonexistent");
    expect(src).toContain("/scheduling/routes/cmnonexistent");
    expect(src).toContain("/dashboards/foo");
    expect(src).toContain('data-testid="chromed-not-found"');
  });

  it("§2J: spec asserts 404 status + Common destinations + no error boundary", () => {
    const src = read("e2e/not-found-chrome.spec.ts");
    expect(src).toContain("expect(resp?.status()).toBe(404)");
    expect(src).toContain('toContain("Common destinations")');
    expect(src).toContain("global-error-boundary");
  });
});

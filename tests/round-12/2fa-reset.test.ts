import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1D — Reset 2FA admin button structural gate.
 *
 * The live Playwright spec (e2e/2fa-reset.spec.ts) exercises the
 * full flow once §1E provisions Playwright. The structural test
 * pins the rendered copy + audit-row name + button visibility
 * conditions so a refactor doesn't silently break the spec.
 */

describe("Round-12 §1D — Reset 2FA gating", () => {
  it("admin/users/[id] enrolled panel reads `Enrolled · {ISO}`", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toContain('data-testid="two-factor-enrolled-panel"');
    expect(src).toContain('data-testid="two-factor-enrolled-line"');
    expect(src).toContain("Enrolled");
    expect(src).toContain("{user.totpEnabledAt.toISOString()}");
  });

  it("admin/users/[id] un-enrolled panel reads `Not enrolled`", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toContain("Not enrolled");
  });

  it("Reset 2FA button is gated behind ConfirmButton with explicit warning", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toContain("Reset 2FA");
    expect(src).toMatch(/ConfirmButton message="Reset this user's 2FA/);
  });

  it("adminResetTotpAction writes audit with action=2fa:admin-reset", () => {
    const src = read("src/server/actions/2fa.ts");
    expect(src).toContain('action: "2fa:admin-reset"');
    expect(src).toContain("totpSecret: null");
    expect(src).toContain("totpEnabledAt: null");
  });

  it("e2e/2fa-reset.spec.ts ships the live Playwright spec", () => {
    const path = join(ROOT, "e2e/2fa-reset.spec.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("two-factor-enrolled-panel");
    expect(src).toContain('action: "2fa:admin-reset"');
    expect(src).toContain("totpSecret: null");
  });
});

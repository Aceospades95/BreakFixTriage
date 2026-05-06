import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Closes findings §3.A9.
 *
 * The canonical audit-log route is /admin/audit. /audit is a thin
 * server redirect to it. Internal links should reference the
 * canonical path.
 *
 * This test pins:
 *   1. /admin/audit/page.tsx exists.
 *   2. /audit/page.tsx contains a redirect("/admin/audit") call.
 *   3. Known internal-link sites (admin index card, admin
 *      sidebar) point to /admin/audit, not /audit.
 */

const ROOT = process.cwd();

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

describe("Audit route canonicalisation (§3.A9)", () => {
  it("/admin/audit/page.tsx exists", () => {
    expect(
      existsSync(join(ROOT, "src/app/(app)/admin/audit/page.tsx")),
    ).toBe(true);
  });

  it("/audit/page.tsx is a redirect to /admin/audit", () => {
    const src = read("src/app/(app)/audit/page.tsx");
    expect(src).toMatch(/redirect\(/);
    expect(src).toMatch(/\/admin\/audit/);
  });

  it("admin index card links to /admin/audit (not /audit)", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    // The card's href entry. Look for the audit-log title in
    // proximity to its href.
    expect(src).toMatch(/href:\s*["']\/admin\/audit["'][\s\S]{0,80}Audit log/);
    // And not the bare /audit on that card
    const auditCardRegex = /href:\s*["']\/audit["'][\s\S]{0,80}Audit log/;
    expect(src).not.toMatch(auditCardRegex);
  });

  it("admin sidebar links to /admin/audit", () => {
    const src = read("src/components/admin-sidebar.tsx");
    expect(src).toMatch(/href:\s*["']\/admin\/audit["'][^]*Audit log/);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Round-14 — structural gate for the /admin segment.
 *
 * ADR 0017 relaxed the admin layout from USERS_MANAGE-only to
 * "USERS_MANAGE OR EMAIL_WRITE" so ops managers can reach the email
 * admin pages. The layout is therefore no longer a sufficient gate
 * on its own: every page under src/app/(app)/admin MUST carry its
 * own `requireRole(PERMISSIONS.…)` call, or an EMAIL_WRITE session
 * could open it. docs/round-14-assumptions.md #4 recorded this as a
 * manually-audited assumption; this test makes it an invariant.
 */

const ADMIN_ROOT = join(process.cwd(), "src/app/(app)/admin");

function collectPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectPages(full));
    } else if (entry === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

describe("Round-14 — every /admin page carries its own permission gate", () => {
  const pages = collectPages(ADMIN_ROOT);

  it("finds the admin pages (sanity: the segment hasn't moved)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(25);
  });

  for (const page of pages) {
    const rel = page.slice(process.cwd().length + 1);
    it(`${rel} calls requireRole(PERMISSIONS.…)`, () => {
      const src = readFileSync(page, "utf8");
      expect(
        /requireRole\(\s*PERMISSIONS\./.test(src),
        `${rel} has no requireRole(PERMISSIONS.…) call — the admin ` +
          `layout admits EMAIL_WRITE sessions, so a page without its ` +
          `own gate is reachable by ops managers. See ADR 0017.`,
      ).toBe(true);
    });
  }
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Round-7 §1B + Round-13 hotfix — admin not-found must render
 * the chromed handler for every unmatched admin path.
 *
 * R13 hotfix removed the [...notfound] catch-all pages because
 * Next.js was rendering them as "found" routes returning HTTP
 * 200 even when they called notFound() — the test for this is
 * e2e/not-found-chrome.spec.ts which asserts status 404. Without
 * the catch-alls, unmatched paths naturally walk up to the
 * closest not-found.tsx boundary with the proper 404 status.
 *
 * Structural invariant the test pins:
 *
 *   1. (app)/not-found.tsx exists and ships the chromed-not-found
 *      data-testid the brief requires.
 *   2. (app)/admin/not-found.tsx exists, ships the data-testid,
 *      and renders the admin destinations grid.
 */

const ROOT = process.cwd();
const required: { path: string; mustContain: string[] }[] = [
  {
    path: "src/app/(app)/not-found.tsx",
    mustContain: ['data-testid="chromed-not-found"', "Common destinations"],
  },
  {
    path: "src/app/(app)/admin/not-found.tsx",
    mustContain: [
      'data-testid="chromed-not-found"',
      "Admin destinations",
    ],
  },
];

describe("Round-7 §1B: chromed not-found for /admin/* and /(app)/*", () => {
  for (const { path, mustContain } of required) {
    it(`${path} exists and contains expected markers`, () => {
      const full = join(ROOT, path);
      expect(existsSync(full), `missing ${path}`).toBe(true);
      const src = readFileSync(full, "utf8");
      for (const needle of mustContain) {
        expect(
          src.includes(needle),
          `${path} should contain ${JSON.stringify(needle)}`,
        ).toBe(true);
      }
    });
  }

  it("R13 hotfix — catch-all routes were intentionally removed", () => {
    // Without the [...notfound] catch-all, unmatched paths walk
    // up to the closest not-found.tsx boundary with a real 404.
    // The catch-all pages were rendering at HTTP 200 even when
    // they called notFound() — see e2e/not-found-chrome.spec.ts.
    expect(
      existsSync(join(ROOT, "src/app/(app)/[...notfound]/page.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(ROOT, "src/app/(app)/admin/[...notfound]/page.tsx")),
    ).toBe(false);
  });

  it("dynamic detail pages call notFound() on missing entities", () => {
    // The R13 hotfix relies on /admin/users/[userId],
    // /scheduling/routes/[routeId], /tickets/[ticketId] each
    // calling notFound() when the lookup returns null. Pin the
    // shape so a refactor doesn't silently fall back to a 200
    // JSX placeholder.
    for (const path of [
      "src/app/(app)/admin/users/[userId]/page.tsx",
      "src/app/(app)/scheduling/routes/[routeId]/page.tsx",
      "src/app/(app)/tickets/[ticketId]/page.tsx",
    ]) {
      const src = readFileSync(join(ROOT, path), "utf8");
      expect(src).toMatch(/from "next\/navigation"/);
      expect(src).toContain("notFound()");
    }
  });
});

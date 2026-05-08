import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-12 §2J — chromed not-found regression.
 *
 * Round-7 §1B shipped chromed (app)/not-found.tsx + admin
 * /admin/not-found.tsx pages. R12 verifies no future refactor
 * regresses to the bare Next.js default.
 *
 * Each route below intentionally points at a non-existent target.
 * The page MUST render the chromed-not-found testid; it MUST NOT
 * render the global-error-boundary testid.
 *
 * Common destinations sitemap is rendered for the (app) scope; the
 * /admin scope renders an admin-specific destination grid. Both
 * paths share the same data-testid="chromed-not-found" anchor.
 */

const NON_EXISTENT_ROUTES = [
  { path: "/admin/foobar-nonsense", scope: "admin" },
  { path: "/tickets/INC9999999", scope: "app" },
  { path: "/admin/users/cmnonexistent", scope: "admin" },
  { path: "/scheduling/routes/cmnonexistent", scope: "app" },
  { path: "/dashboards/foo", scope: "app" },
] as const;

test.describe("§2J chromed not-found", () => {
  test.beforeEach(async ({ page }) => {
    // Round-13 hotfix — JWT cookie helper avoids the form path.
    await signInAs(page, PERSONA.ADMIN);
  });

  for (const { path, scope } of NON_EXISTENT_ROUTES) {
    test(`${path} → chromed-not-found (${scope} scope)`, async ({ page }) => {
      const resp = await page.goto(path);
      // 404 status with the chromed page rendered. Either is
      // acceptable — Next.js notFound() returns 404.
      expect(resp?.status()).toBe(404);

      const html = await page.content();
      expect(
        html,
        `${path} did not render the chromed not-found testid`,
      ).toContain('data-testid="chromed-not-found"');

      // Common destinations grid — the safety-net affordance from
      // Round-7 §1B.
      expect(html).toContain("Common destinations");

      // No global error boundary leak.
      await expect(page.getByTestId("global-error-boundary")).toHaveCount(0);
    });
  }
});

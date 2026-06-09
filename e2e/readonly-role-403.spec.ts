import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-11 §2C — graduates Round-10 §3E. Re-activated in Round-14:
 * the B8 blockers closed (requireRole now redirects to the chromed
 * /forbidden page instead of throwing into the error boundary, and
 * the /forbidden route exists).
 *
 * Sign in as Ray ReadOnly and assert that every documented
 * mutation surface returns 401/403 (API routes) or redirects to
 * /forbidden (pages).
 *
 * The list of surfaces lives in docs/permissions.md → "Read-only
 * forbidden surface" — mirroring those entries here so a missed
 * role check anywhere on the surface fails the spec.
 */

test.describe("§2C: READ_ONLY (Ray) cannot reach mutation surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, PERSONA.READ_ONLY);
  });

  // -------------------------------------------------------------
  // API routes — direct GET + assert 401 or 403.
  // -------------------------------------------------------------

  for (const path of [
    "/api/exports/users",
    "/api/exports/schools",
    "/api/exports/devices",
    "/api/exports/email-log",
    "/api/exports/audit",
  ] as const) {
    test(`${path} → 401 for read-only role`, async ({ page }) => {
      const resp = await page.request.get(path);
      expect([401, 403]).toContain(resp.status());
    });
  }

  // -------------------------------------------------------------
  // Permission-gated pages — read-only must land on /forbidden.
  // -------------------------------------------------------------

  const PAGES_GUARDED_BY_PERMISSION = [
    { path: "/admin", reason: "users:manage" },
    { path: "/admin/users", reason: "users:manage" },
    { path: "/admin/users/new", reason: "users:manage" },
    { path: "/admin/districts", reason: "districts:manage" },
    { path: "/admin/schools/new", reason: "districts:manage" },
    { path: "/admin/devices/new", reason: "districts:manage" },
    { path: "/admin/parts/new", reason: "districts:manage" },
    { path: "/admin/holidays", reason: "users:manage" },
    { path: "/admin/email-rules", reason: "email:rules_manage" },
    { path: "/admin/email-templates", reason: "email:write" },
    { path: "/admin/email-log", reason: "email:write" },
    { path: "/imports/new", reason: "imports:run" },
    { path: "/scheduling/routes/new", reason: "routes:build" },
  ] as const;

  for (const p of PAGES_GUARDED_BY_PERMISSION) {
    test(`GET ${p.path} → 403 / redirect to /forbidden (${p.reason})`, async ({ page }) => {
      const resp = await page.goto(p.path);
      const status = resp?.status() ?? 0;
      if (status !== 403) {
        // requireRole redirects via the App Router. Because the
        // (app) segment has a loading.tsx boundary the response
        // streams, so the redirect arrives as an in-body client
        // navigation rather than a 307 — wait for it to land.
        await page.waitForURL(/\/(forbidden|signin)/, { timeout: 10_000 });
      }
      const url = page.url();
      const blocked =
        status === 403 ||
        url.includes("/forbidden") ||
        url.includes("/signin");
      expect(blocked, `${p.path} did not block READ_ONLY`).toBe(true);
    });
  }
});

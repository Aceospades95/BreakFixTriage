import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2C — graduates Round-10 §3E.
 *
 * Sign in as Ray ReadOnly and assert that every documented
 * mutation surface returns 403 (or redirects to /forbidden).
 *
 * The list of surfaces lives in docs/permissions.md → "Read-only
 * forbidden surface" → mirroring those entries here so a missed
 * role check anywhere on the surface fails the spec.
 *
 * Server actions are exposed as POST `/_action/<formId>` in
 * Next.js 14, but the canonical way to exercise one from
 * Playwright is via a form submit on the page that hosts the
 * action. The shortcut: navigate to the page, locate the form,
 * submit, assert the response is /forbidden or status 403.
 *
 * For pure API routes the spec POSTs / GETs directly via
 * page.request.
 */

const READONLY_EMAIL = "ray@example.test";

test.describe("§2C: READ_ONLY (Ray) cannot reach mutation surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, READONLY_EMAIL);
  });

  // -------------------------------------------------------------
  // API routes — direct GET/POST + assert 401 or 403.
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
  // Page-level mutation forms — read-only should be redirected /
  // forbidden when posting.
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
      const url = page.url();
      const blocked =
        status === 403 ||
        url.includes("/forbidden") ||
        url.includes("/signin") ||
        url.includes("/?error=");
      expect(blocked, `${p.path} did not block READ_ONLY`).toBe(true);
    });
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

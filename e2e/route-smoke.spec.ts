import { test, expect } from "@playwright/test";

/**
 * Round-11 §HOTFIX-2 — route smoke gate.
 *
 * Walks every documented sitemap entry, signs in as the lowest-
 * privilege role, and asserts:
 *   1. HTTP 200 (or documented intentional redirect)
 *   2. DOM does NOT contain "Something broke on this page"
 *   3. DOM does NOT contain "digest:" (Next.js error boundary)
 *   4. DOM does NOT contain "Application error: a server-side
 *      exception has occurred"
 *
 * This spec is the structural guard that would have caught the
 * /tickets SSR error (digest=3087090167) before it shipped.
 *
 * Authoritative source for the route list is `docs/sitemap.md`.
 * Update both when adding a route.
 */

const ROUTES: Array<{ path: string; lowestRole: string }> = [
  // Public — no sign-in required
  { path: "/signin", lowestRole: "anon" },

  // Authenticated, no permission gate
  { path: "/", lowestRole: "READ_ONLY" },
  { path: "/audit", lowestRole: "READ_ONLY" },
  { path: "/me/preferences", lowestRole: "READ_ONLY" },
  { path: "/me/schedule", lowestRole: "READ_ONLY" },
  { path: "/my-day", lowestRole: "READ_ONLY" },
  { path: "/notifications", lowestRole: "READ_ONLY" },
  { path: "/profile", lowestRole: "READ_ONLY" },
  { path: "/profile/2fa", lowestRole: "READ_ONLY" },

  // Tickets
  { path: "/tickets", lowestRole: "READ_ONLY" },
  { path: "/tickets/kanban", lowestRole: "READ_ONLY" },
  { path: "/bench", lowestRole: "READ_ONLY" },
  { path: "/duplicates", lowestRole: "READ_ONLY" },
  { path: "/scan", lowestRole: "READ_ONLY" },
  { path: "/scan/warehouse", lowestRole: "TECHNICIAN" },

  // Scheduling
  { path: "/scheduling", lowestRole: "READ_ONLY" },
  { path: "/scheduling/calendar", lowestRole: "READ_ONLY" },
  { path: "/scheduling/people", lowestRole: "READ_ONLY" },
  { path: "/scheduling/routes", lowestRole: "READ_ONLY" },
  { path: "/scheduling/routes/new", lowestRole: "DISPATCHER" },

  // Imports + Quotes + Invoices
  { path: "/imports", lowestRole: "READ_ONLY" },
  { path: "/imports/new", lowestRole: "OPS_MANAGER" },
  { path: "/quotes", lowestRole: "READ_ONLY" },
  { path: "/invoices", lowestRole: "READ_ONLY" },

  // Dashboards
  { path: "/dashboards", lowestRole: "READ_ONLY" },
  { path: "/dashboards/devices", lowestRole: "READ_ONLY" },
  { path: "/dashboards/finance", lowestRole: "READ_ONLY" },
  { path: "/dashboards/productivity", lowestRole: "READ_ONLY" },

  // Admin
  { path: "/admin", lowestRole: "ADMIN" },
  { path: "/admin/audit", lowestRole: "ADMIN" },
  { path: "/admin/device-models", lowestRole: "ADMIN" },
  { path: "/admin/devices", lowestRole: "ADMIN" },
  { path: "/admin/devices/new", lowestRole: "ADMIN" },
  { path: "/admin/districts", lowestRole: "ADMIN" },
  { path: "/admin/email-log", lowestRole: "OPS_MANAGER" },
  { path: "/admin/email-rules", lowestRole: "ADMIN" },
  { path: "/admin/email-templates", lowestRole: "OPS_MANAGER" },
  { path: "/admin/holidays", lowestRole: "ADMIN" },
  { path: "/admin/parts", lowestRole: "ADMIN" },
  { path: "/admin/parts/new", lowestRole: "ADMIN" },
  { path: "/admin/permissions", lowestRole: "ADMIN" },
  { path: "/admin/schools", lowestRole: "ADMIN" },
  { path: "/admin/schools/new", lowestRole: "ADMIN" },
  { path: "/admin/settings", lowestRole: "ADMIN" },
  { path: "/admin/statuses", lowestRole: "ADMIN" },
  { path: "/admin/templates", lowestRole: "ADMIN" },
  { path: "/admin/tools/bulk-close", lowestRole: "ADMIN" },
  { path: "/admin/users", lowestRole: "ADMIN" },
  { path: "/admin/users/new", lowestRole: "ADMIN" },
];

const ERROR_MARKERS = [
  "Something broke on this page",
  "digest:",
  "Application error: a server-side exception has occurred",
];

for (const route of ROUTES) {
  test(`smoke: ${route.path} (as ${route.lowestRole})`, async ({ page }) => {
    if (route.lowestRole !== "anon") {
      await signIn(page, route.lowestRole);
    }
    const resp = await page.goto(route.path);
    // Round-12 §1E — exact 200 (not 3xx, 4xx, 5xx). The brief
    // accepts the documented intentional redirects but every
    // route in this list is a destination URL.
    expect(resp?.status(), `${route.path} returned non-200`).toBe(200);

    const html = await page.content();
    for (const marker of ERROR_MARKERS) {
      expect(
        html.includes(marker),
        `${route.path} rendered an error boundary marker: "${marker}"`,
      ).toBe(false);
    }

    // Round-12 §1E — explicit testid checks (per brief).
    await expect(
      page.getByTestId("global-error-boundary"),
      `${route.path} rendered the global error boundary`,
    ).toHaveCount(0);
    await expect(
      page.getByTestId("chromed-not-found"),
      `${route.path} unexpectedly rendered the chromed-not-found page`,
    ).toHaveCount(0);
  });
}

async function signIn(page: import("@playwright/test").Page, role: string) {
  // Persona fixtures expected from the seed: a single user per role
  // with a known email pattern. Wired up in §2D CI Postgres.
  const email = `${role.toLowerCase().replace("_", "")}@example.test`;
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

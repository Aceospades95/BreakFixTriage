import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-14 — re-activated against a live runtime. Sign-in now
 * uses the JWT cookie helper (e2e/lib/sign-in-as.ts) instead of
 * the form path, resolving the B14 blocker for this spec.
 *
 * The structural sitemap-coverage gate at
 * tests/round-11/route-smoke-coverage.test.ts continues to
 * protect against the /tickets SSR class of regression — it
 * runs in vitest (no browser) so doesn't depend on this spec.
 *
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
  { path: "/forbidden", lowestRole: "READ_ONLY" },

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

const PERSONA_BY_ROLE: Record<string, string> = {
  READ_ONLY: PERSONA.READ_ONLY,
  TECHNICIAN: PERSONA.TECHNICIAN,
  DISPATCHER: PERSONA.DISPATCHER,
  OPS_MANAGER: PERSONA.OPS_MANAGER,
  WAREHOUSE: PERSONA.WAREHOUSE,
  DRIVER: PERSONA.DRIVER,
  ADMIN: PERSONA.ADMIN,
};

for (const route of ROUTES) {
  test(`smoke: ${route.path} (as ${route.lowestRole})`, async ({ page }) => {
    if (route.lowestRole !== "anon") {
      await signInAs(page, PERSONA_BY_ROLE[route.lowestRole]!);
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

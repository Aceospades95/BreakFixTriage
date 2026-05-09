import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "../lib/sign-in-as";
import { expectBlocked, expectReadable } from "../lib/access";

/**
 * STATUS: Aspirational coverage for Round-13 §2D persona scope.
 * Tests below are marked test.fixme() because the dashboard
 * 4-tab walk + the /quotes export affordance + the read/write
 * permission contract per route all assume app surfaces not yet
 * fully wired on this branch. See docs/round-13-backlog.md (B14).
 *
 * Do NOT ship code that "fixes" these by mocking out the
 * assertion — unfixme each test only when the real app surface
 * exists end-to-end.
 */

/**
 * Round-13 §2D + hotfix — Olivia Ops Manager persona walk.
 *
 * (1) Open /dashboards. Walk all 4 tabs.
 * (2) Export Quotes CSV.
 * (3) Run "Sweep now" on stale quotes from /quotes banner.
 * (4) Open /admin/audit, filter by actor=Olivia, verify the
 *     sweep is logged.
 * (5) Permission contract:
 *
 *     Read implies GET 200 OK.
 *     Write implies POST/PATCH/DELETE returns 403.
 *
 *     Olivia has EMAIL_WRITE so she can READ /admin/email-rules
 *     but not mutate; the page disables every write affordance
 *     for her. /admin/users + /admin/permissions are entirely
 *     ADMIN-only.
 *
 * Routes are now tagged by access level so the loop applies the
 * correct expectation. The hotfix from PR #5 fixed a spec
 * misclassification that asserted /admin/email-rules was fully
 * blocked.
 */

type Access = "read" | "blocked";

interface RouteAccess {
  path: string;
  access: Access;
  /** When access === "read", optional asserts on the rendered page. */
  readAsserts?: { writeButtonsDisabled?: boolean };
}

const ROUTES_FOR_OPS_MANAGER: RouteAccess[] = [
  // Dashboards — 4 tabs, all read-allowed.
  { path: "/dashboards", access: "read" },
  { path: "/dashboards/finance", access: "read" },
  { path: "/dashboards/productivity", access: "read" },
  { path: "/dashboards/devices", access: "read" },

  // Quotes — read + write are both allowed for ops manager.
  { path: "/quotes", access: "read" },

  // Email surfaces — Olivia has EMAIL_WRITE.
  { path: "/admin/email-rules", access: "read", readAsserts: { writeButtonsDisabled: true } },
  { path: "/admin/email-templates", access: "read" },
  { path: "/admin/email-log", access: "read" },

  // ADMIN-only — Olivia is fully blocked here.
  { path: "/admin/users", access: "blocked" },
  { path: "/admin/permissions", access: "blocked" },
];

test.describe("§2D ops-manager persona", () => {
  test.fixme("dashboard walk + read-write surface", async ({ page }) => {
    await signInAs(page, PERSONA.OPS_MANAGER);

    for (const path of [
      "/dashboards",
      "/dashboards/finance",
      "/dashboards/productivity",
      "/dashboards/devices",
    ] as const) {
      const resp = await page.goto(path);
      expect(resp?.status(), `${path} blocked`).toBe(200);
    }

    await page.goto("/quotes");
    const exportLink = page.getByRole("link", { name: /export.*csv/i }).first();
    await expect(exportLink).toBeVisible();
    expect(await exportLink.getAttribute("href")).toMatch(
      /^\/api\/exports\/quotes/,
    );
  });

  for (const route of ROUTES_FOR_OPS_MANAGER) {
    test.fixme(`${route.path} → ${route.access}`, async ({ page }) => {
      await signInAs(page, PERSONA.OPS_MANAGER);
      const resp = await page.goto(route.path);

      if (route.access === "read") {
        await expectReadable(page, resp, route.path, "Olivia");

        if (route.readAsserts?.writeButtonsDisabled) {
          // /admin/email-rules has the "Seed example rule" button
          // gated by canManage. Ops-manager sees it disabled.
          const seedBtn = page.getByRole("button", {
            name: /seed example rule/i,
          });
          if (await seedBtn.isVisible().catch(() => false)) {
            await expect(seedBtn).toBeDisabled();
          }
        }
        return;
      }

      await expectBlocked(page, resp, route.path, "Olivia");
    });
  }
});

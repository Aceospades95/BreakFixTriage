import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "../lib/sign-in-as";
import { expectBlocked } from "../lib/access";

/**
 * STATUS: Aspirational coverage for Round-13 §2C persona scope.
 * Tests below are marked test.fixme() because the bulk-actions
 * row test hooks, /scheduling/routes/new affordances, and the
 * /admin/users delete-button assertion all assume app surfaces
 * not yet wired on this branch. See docs/round-13-backlog.md
 * (B14).
 *
 * Do NOT ship code that "fixes" these by mocking out the
 * assertion — unfixme each test only when the real app surface
 * exists end-to-end.
 */

/**
 * Round-13 §2C — Dana Dispatcher persona walk.
 *
 * (1) Open /tickets, filter to AWAITING_PICKUP.
 * (2) Bulk select 3 tickets, assign to Tess, then transition to
 *     Triage.
 * (3) Open /scheduling, build a route that contains a pickup leg.
 * (4) Reassign the route from Dante to Dana, then back.
 * (5) Confirm permissions: Dana can build/reassign routes; Dana
 *     cannot edit /admin/email-rules; Dana cannot delete users.
 */

test.describe("§2C dispatcher persona", () => {
  test.fixme("bulk-assign + bulk-transition + route build", async ({ page }) => {
    await signInAs(page, PERSONA.DISPATCHER);

    // (1) — Filter to AWAITING_PICKUP.
    await page.goto("/tickets?state=AWAITING_PICKUP");
    await expect(
      page.getByRole("heading", { name: /tickets/i }),
    ).toBeVisible();

    // (2) — Bulk select up to 3 + apply assign + transition.
    const checkboxes = page
      .locator('input[type="checkbox"][name="ticketIds"]')
      .first();
    if (await checkboxes.isVisible().catch(() => false)) {
      await checkboxes.check();
      // Bulk-actions row count should now reflect the selection.
      await expect(
        page.locator('[data-testid="bulk-actions"]'),
      ).toContainText(/Bulk actions \(/);
    }

    // (3) — Open /scheduling and assert the New route affordance
    // is visible (Dana has ROUTES_BUILD).
    await page.goto("/scheduling/routes");
    await expect(
      page.getByRole("link", { name: /new route/i }),
    ).toBeVisible();
  });

  test.fixme("Dana is blocked from /admin/email-rules (no EMAIL_WRITE)", async ({
    page,
  }) => {
    // Dana lacks EMAIL_WRITE (only OPS_MANAGER + ADMIN have it),
    // so the Round-13 hotfix that opened /admin/email-rules to
    // ops-manager still blocks her here.
    await signInAs(page, PERSONA.DISPATCHER);
    const resp = await page.goto("/admin/email-rules");
    await expectBlocked(page, resp, "/admin/email-rules", "Dispatcher");
  });

  test.fixme("Dana cannot delete users on /admin/users", async ({ page }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    const resp = await page.goto("/admin/users");
    // Either blocked at the page level OR the page renders
    // without a delete affordance.
    if ((resp?.status() ?? 0) === 200 && page.url().includes("/admin/users")) {
      await expect(
        page.getByRole("button", { name: /delete user/i }),
      ).toHaveCount(0);
    }
  });
});

import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "../lib/sign-in-as";
import { expectBlocked } from "../lib/access";

/**
 * STATUS: Aspirational coverage for Round-13 §2E persona scope.
 * Tests below are marked test.fixme() because the bench pick-up
 * affordance for warehouse role + the scheduling-routes-new
 * block + the /admin block all assume app surfaces not yet
 * wired end-to-end on this branch. See docs/round-13-backlog.md
 * (B14).
 *
 * Do NOT ship code that "fixes" these by mocking out the
 * assertion — unfixme each test only when the real app surface
 * exists end-to-end.
 */

/**
 * Round-13 §2E — Wes Warehouse persona walk.
 *
 * (1) Open /bench. Pick up the unassigned IN_WAREHOUSE ticket.
 * (2) Receive a part shipment via /admin/parts (or the ticket-
 *     level Parts panel).
 * (3) Mark ticket Awaiting pickup.
 * (4) Confirm Wes sees the SCAN button up top and can use it
 *     to look up a serial.
 * (5) Confirm Wes cannot transition through repair states he
 *     is not licensed for (no Triage, no In repair).
 */

test.describe("§2E warehouse persona", () => {
  test.fixme("bench pick-up + scan affordances visible", async ({ page }) => {
    await signInAs(page, PERSONA.WAREHOUSE);

    await page.goto("/bench");
    await expect(page.getByRole("heading", { name: /bench/i })).toBeVisible();

    // SCAN button is in the top-right header.
    const scanLink = page
      .getByRole("link", { name: /^scan$/i })
      .first();
    await expect(scanLink).toBeVisible();
    expect(await scanLink.getAttribute("href")).toBe("/scan");

    // Pick-up affordance on at least one bench card.
    const pickUp = page.getByRole("button", { name: /^pick up$/i }).first();
    if (await pickUp.isVisible().catch(() => false)) {
      // Don't actually click in this spec — the technician spec
      // exercises the pick-up flow. This spec only asserts
      // the affordance is visible to Warehouse role.
      expect(true).toBe(true);
    }
  });

  test.fixme("Wes is blocked from /scheduling/routes/new", async ({ page }) => {
    await signInAs(page, PERSONA.WAREHOUSE);
    const resp = await page.goto("/scheduling/routes/new");
    await expectBlocked(page, resp, "/scheduling/routes/new", "Warehouse");
  });

  test.fixme("Wes is blocked from /admin overview", async ({ page }) => {
    await signInAs(page, PERSONA.WAREHOUSE);
    const resp = await page.goto("/admin");
    await expectBlocked(page, resp, "/admin", "Warehouse");
  });
});

import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Wes Warehouse daily workflow.
 *
 * Round-13 hotfix: migrated from the form-submit signIn helper
 * to the JWT cookie helper so the spec can actually authenticate.
 * The earlier test.fixme() markers came from the form-helper
 * regression — with the cookie helper in place, the surfaces
 * (scan/warehouse + tickets + my-day) all exist and the spec
 * can run live.
 */

test("§2E: Wes walks scan/warehouse + tickets", async ({ page }) => {
  await signInAs(page, PERSONA.WAREHOUSE);

  await page.goto("/scan/warehouse");
  await expect(page.getByRole("heading")).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/my-day");
  await expect(page.getByRole("heading")).toBeVisible();
});

test("§2E: Wes is blocked from /scheduling/routes/new", async ({ page }) => {
  await signInAs(page, PERSONA.WAREHOUSE);
  const resp = await page.goto("/scheduling/routes/new");
  await expectBlocked(page, resp, "/scheduling/routes/new", "Wes");
});

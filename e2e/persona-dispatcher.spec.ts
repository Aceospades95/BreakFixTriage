import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Dana Dispatcher daily workflow.
 */

test("§2E: Dana walks scheduling + tickets transition", async ({ page }) => {
  await signInAs(page, PERSONA.DISPATCHER);

  await page.goto("/scheduling/routes");
  await expect(page.getByRole("heading", { name: /routes/i })).toBeVisible();

  await page.goto("/scheduling/routes/new");
  await expect(page.getByRole("heading", { name: /new route/i })).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();
});

test("§2E: Dana cannot reach /imports/new (imports:run)", async ({ page }) => {
  await signInAs(page, PERSONA.DISPATCHER);
  const resp = await page.goto("/imports/new");
  await expectBlocked(page, resp, "/imports/new", "Dana");
});

import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Olivia Ops (OPS_MANAGER) daily workflow.
 */

test.fixme("§2E: Olivia Ops walks tickets + imports + scheduling + quotes", async ({ page }) => {
  await signInAs(page, PERSONA.OPS_MANAGER);

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: /imports/i })).toBeVisible();

  await page.goto("/imports/new");
  await expect(page.getByRole("heading", { name: /new import/i })).toBeVisible();

  await page.goto("/scheduling");
  await expect(page.getByRole("heading", { name: /scheduling/i })).toBeVisible();

  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: /quotes/i })).toBeVisible();
});

test.fixme("§2E: Olivia Ops is blocked from /admin", async ({ page }) => {
  await signInAs(page, PERSONA.OPS_MANAGER);
  const resp = await page.goto("/admin");
  await expectBlocked(page, resp, "/admin", "Olivia Ops");
});

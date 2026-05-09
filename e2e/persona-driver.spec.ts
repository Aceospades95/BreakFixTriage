import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Dante Driver daily workflow.
 */

test.fixme("§2E: Dante walks tickets read + scheduling read", async ({ page }) => {
  await signInAs(page, PERSONA.DRIVER);

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/scheduling");
  await expect(page.getByRole("heading", { name: /scheduling/i })).toBeVisible();
});

test.fixme("§2E: Dante cannot transition tickets via the bulk form", async ({ page }) => {
  await signInAs(page, PERSONA.DRIVER);
  await page.goto("/tickets");
  // Drivers don't have TICKETS_TRANSITION; the page hides the bulk
  // form entirely when canTransition === false.
  const bulk = page.locator('[data-testid="bulk-actions"]');
  await expect(bulk).toHaveCount(0);
});

test.fixme("§2E: Dante is blocked from admin overview + imports/new", async ({ page }) => {
  await signInAs(page, PERSONA.DRIVER);

  for (const path of ["/admin", "/imports/new"] as const) {
    const resp = await page.goto(path);
    await expectBlocked(page, resp, path, "Dante");
  }
});

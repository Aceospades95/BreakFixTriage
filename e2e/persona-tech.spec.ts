import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Tess Technician daily workflow.
 */

test("§2E: Tess walks tickets + scan + my-day", async ({ page }) => {
  await signInAs(page, PERSONA.TECHNICIAN);

  await page.goto("/my-day");
  await expect(page.getByRole("heading")).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/scan");
  await expect(page.getByRole("heading", { name: /scan/i })).toBeVisible();

  await page.goto("/scan/warehouse");
  await expect(page.getByRole("heading")).toBeVisible();
});

test("§2E: Tess is blocked from admin overview", async ({ page }) => {
  await signInAs(page, PERSONA.TECHNICIAN);
  const resp = await page.goto("/admin");
  await expectBlocked(page, resp, "/admin", "Tess");
});

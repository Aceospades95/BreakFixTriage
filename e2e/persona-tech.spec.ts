import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Tess Technician daily workflow.
 */

const EMAIL = "tess@example.test";

test("§2E: Tess walks tickets + scan + my-day", async ({ page }) => {
  await signIn(page, EMAIL);

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
  await signIn(page, EMAIL);
  const resp = await page.goto("/admin");
  const blocked =
    (resp?.status() ?? 0) === 403 ||
    page.url().includes("/forbidden") ||
    page.url().includes("/?error=");
  expect(blocked).toBe(true);
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Wes Warehouse daily workflow.
 */

const EMAIL = "wes@example.test";

test("§2E: Wes walks scan/warehouse + tickets", async ({ page }) => {
  await signIn(page, EMAIL);

  await page.goto("/scan/warehouse");
  await expect(page.getByRole("heading")).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/my-day");
  await expect(page.getByRole("heading")).toBeVisible();
});

test("§2E: Wes is blocked from /scheduling/routes/new", async ({ page }) => {
  await signIn(page, EMAIL);
  const resp = await page.goto("/scheduling/routes/new");
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

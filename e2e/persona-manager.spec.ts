import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Olivia Ops (OPS_MANAGER) daily workflow.
 */

const EMAIL = "olivia@example.test";

test("§2E: Olivia Ops walks tickets + imports + scheduling + quotes", async ({ page }) => {
  await signIn(page, EMAIL);

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

test("§2E: Olivia Ops is blocked from /admin", async ({ page }) => {
  await signIn(page, EMAIL);
  const resp = await page.goto("/admin");
  const blocked =
    (resp?.status() ?? 0) === 403 ||
    page.url().includes("/forbidden") ||
    page.url().includes("/?error=");
  expect(blocked, "Olivia Ops should NOT see /admin overview").toBe(true);
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

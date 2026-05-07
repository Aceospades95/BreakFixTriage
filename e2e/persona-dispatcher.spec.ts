import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Dana Dispatcher daily workflow.
 */

const EMAIL = "dana@example.test";

test("§2E: Dana walks scheduling + tickets transition", async ({ page }) => {
  await signIn(page, EMAIL);

  await page.goto("/scheduling/routes");
  await expect(page.getByRole("heading", { name: /routes/i })).toBeVisible();

  await page.goto("/scheduling/routes/new");
  await expect(page.getByRole("heading", { name: /new route/i })).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();
});

test("§2E: Dana cannot reach /imports/new (imports:run)", async ({ page }) => {
  await signIn(page, EMAIL);
  const resp = await page.goto("/imports/new");
  const blocked =
    (resp?.status() ?? 0) === 403 ||
    page.url().includes("/forbidden") ||
    page.url().includes("/?error=");
  expect(blocked, "Dana should not see /imports/new").toBe(true);
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

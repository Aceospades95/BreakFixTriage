import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Dante Driver daily workflow.
 */

const EMAIL = "dante@example.test";

test("§2E: Dante walks tickets read + scheduling read", async ({ page }) => {
  await signIn(page, EMAIL);

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  await page.goto("/scheduling");
  await expect(page.getByRole("heading", { name: /scheduling/i })).toBeVisible();
});

test("§2E: Dante cannot transition tickets via the bulk form", async ({ page }) => {
  await signIn(page, EMAIL);
  await page.goto("/tickets");
  // Drivers don't have TICKETS_TRANSITION; the page hides the bulk
  // form entirely when canTransition === false.
  const bulk = page.locator('[data-testid="bulk-actions"]');
  await expect(bulk).toHaveCount(0);
});

test("§2E: Dante is blocked from admin overview + imports/new", async ({ page }) => {
  await signIn(page, EMAIL);

  for (const path of ["/admin", "/imports/new"] as const) {
    const resp = await page.goto(path);
    const blocked =
      (resp?.status() ?? 0) === 403 ||
      page.url().includes("/forbidden") ||
      page.url().includes("/?error=");
    expect(blocked, `Dante should not see ${path}`).toBe(true);
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

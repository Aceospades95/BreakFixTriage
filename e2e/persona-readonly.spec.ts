import { test, expect, Page } from "@playwright/test";

/**
 * Round-11 §2E — Ray ReadOnly daily workflow.
 *
 * Companion to §2C `e2e/readonly-role-403.spec.ts` which exhausts
 * the negative-space surface. This spec asserts the POSITIVE
 * read-only walk lands cleanly.
 */

const EMAIL = "ray@example.test";

test("§2E: Ray walks read-only surfaces", async ({ page }) => {
  await signIn(page, EMAIL);

  for (const path of [
    "/tickets",
    "/tickets/kanban",
    "/imports",
    "/scheduling",
    "/quotes",
    "/dashboards",
    "/dashboards/finance",
  ] as const) {
    const resp = await page.goto(path);
    expect(resp?.status() ?? 0, `${path} blocked Ray ReadOnly`).toBeLessThan(400);
  }
});

test("§2E: Ray cannot reach /admin or /imports/new", async ({ page }) => {
  await signIn(page, EMAIL);

  for (const path of ["/admin", "/imports/new"] as const) {
    const resp = await page.goto(path);
    const blocked =
      (resp?.status() ?? 0) === 403 ||
      page.url().includes("/forbidden") ||
      page.url().includes("/?error=");
    expect(blocked, `Ray should not see ${path}`).toBe(true);
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

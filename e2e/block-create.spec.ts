import { test, expect, Page } from "@playwright/test";

/**
 * STATUS: Aspirational coverage. The data-testid="people-row"
 * + data-testid="people-add-block-form" hooks this spec
 * targets are not yet wired into the rendered components on
 * this branch (the people grid renders but without those test
 * IDs). Marked test.fixme() until the test hooks land. See
 * docs/round-13-backlog.md (B14).
 *
 * Round-11 §2A — graduates Round-10 §2C.
 *
 * Sign in as Olivia Ops (ops_manager), open /scheduling/people,
 * click "+ Add" on Tess Technician's row, fill the inline form
 * with kind=PTO + start=09:00 + end=17:00 + note="R11 test block",
 * Save, and assert:
 *
 *   1. The row's timeline now shows the block from 9-17 labelled
 *      "PTO".
 *   2. /admin/audit (filtered to entityType=StaffSchedule) shows
 *      the staff.schedule.created row with Olivia as actor and
 *      Tess as target.
 *
 * Runtime depends on §2D CI Postgres + Playwright. Until that
 * lands the spec is exercised manually per the qa-checklist.
 */

const OPS_EMAIL = "olivia@example.test";
const TECH_NAME = "Tess Technician";

test.fixme("§2A: ops_manager creates a PTO block on a tech's row", async ({ page }) => {
  await signIn(page, OPS_EMAIL);

  await page.goto("/scheduling/people");
  await expect(page.getByRole("heading", { name: /people/i })).toBeVisible();

  const techRow = page.locator(
    `[data-testid="people-row"]:has-text("${TECH_NAME}")`,
  );
  await expect(techRow).toBeVisible();

  await techRow.getByRole("button", { name: /^\+\s*add$/i }).click();

  const form = techRow.locator('form[data-testid="people-add-block-form"]');
  await expect(form).toBeVisible();

  await form.locator('select[name="kind"]').selectOption("PTO");
  await form.locator('input[name="startTime"]').fill("09:00");
  await form.locator('input[name="endTime"]').fill("17:00");
  await form.locator('input[name="note"]').fill("R11 test block");

  await form.getByRole("button", { name: /^save$/i }).click();

  await expect(page).toHaveURL(/\/scheduling\/people/);
  await expect(
    techRow.locator('[data-testid="block-segment"][data-kind="PTO"]'),
  ).toBeVisible();

  // Audit assertion — sign in stays the same; admin route requires
  // ADMIN or USERS_MANAGE so we sign in as Alex.
  await signIn(page, "alex@example.test");
  await page.goto("/admin/audit?entityType=StaffSchedule");

  const auditRow = page.locator("tr", {
    has: page.locator("text=staff.schedule.created"),
  });
  await expect(auditRow).toContainText(OPS_EMAIL);
  await expect(auditRow).toContainText(TECH_NAME);
});

async function signIn(page: Page, email: string) {
  // Sign out first so the seeded persona slot is fresh.
  await page.goto("/api/auth/signout");
  await page
    .getByRole("button", { name: /sign out/i })
    .click()
    .catch(() => {});
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

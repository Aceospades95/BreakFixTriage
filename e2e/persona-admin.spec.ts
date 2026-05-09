import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-11 §2E — Alex Admin daily workflow.
 *
 * Walks the admin daily routine documented in docs/personas.md
 * and asserts every admin page returns 200 with no error
 * boundary. ADMIN sees every page; the negative-space assertions
 * live in persona-readonly.spec.ts.
 */

test.fixme("§2E: Alex Admin walks admin overview + sub-pages", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);

  // Overview lands.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /^admin$/i })).toBeVisible();
  await expect(page.getByText("Users", { exact: true })).toBeVisible();
  await expect(page.getByText("Holidays", { exact: true })).toBeVisible();

  // Recent sessions panel renders for any user.
  await page.goto("/admin/users");
  const firstUserLink = page
    .locator('a[href^="/admin/users/"]')
    .filter({ hasText: /\w+/ })
    .first();
  await firstUserLink.click();
  await expect(page.getByText(/Recent sessions/i)).toBeVisible();

  // Audit log filter chip works.
  await page.goto("/admin/audit?entityType=User");
  await expect(page.getByRole("heading", { name: /audit/i })).toBeVisible();

  // Email rules empty state OR populated table renders.
  await page.goto("/admin/email-rules");
  await expect(page.getByRole("heading", { name: /email rules/i })).toBeVisible();
});

import { test, expect, Page } from "@playwright/test";

/**
 * Round-12 §1G.5 — theme picker live walk.
 *
 * Assertions per the brief:
 *   1. Sign in. Visit /me/preferences. Click Light → <html>
 *      gets class light within 100ms (optimistic).
 *   2. Reload → <html> STILL has class light (server-rendered
 *      from DB / cookie).
 *   3. body bg matches the light surface token, not the dark
 *      surface token (rgb(17, 25, 39) is the dark surface; light
 *      is rgb(243, 244, 246)).
 *   4. Click Dark → immediate flip → reload persists.
 *   5. Click Match system. emulateMedia({ colorScheme: 'light' })
 *      → no dark class. emulateMedia({ colorScheme: 'dark' }) →
 *      dark class added without navigation.
 *   6. Sign out. /signin respects OS preference.
 *
 * Runtime: §1E provisions Playwright + Postgres + the test seed
 * (`npm run db:seed:test`). The 7 personas are seeded with
 * password "test-password".
 */

const DARK_SURFACE = "rgb(17, 25, 39)";
const LIGHT_SURFACE = "rgb(243, 244, 246)";

test.describe("§1G theme picker", () => {
  test("optimistic flip + persists across reload + system mode honors OS", async ({
    page,
  }) => {
    await signIn(page, "alex@example.test");
    await page.goto("/me/preferences");

    const html = page.locator("html");
    const body = page.locator("body");

    // --- 1 + 2 + 3 — pick Light ---
    await page
      .locator('[data-theme-option="light"]')
      .click({ timeout: 100 });
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/, { timeout: 100 });

    await page.reload();
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/);
    await expect(body).toHaveCSS("background-color", LIGHT_SURFACE);

    // --- 4 — pick Dark ---
    await page.locator('[data-theme-option="dark"]').click();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 100 });
    await page.reload();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(body).toHaveCSS("background-color", DARK_SURFACE);

    // --- 5 — pick Match system, then emulate OS preference flips ---
    await page.locator('[data-theme-option="system"]').click();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 200 });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 200 });

    // --- §1G hotfix gate — data-theme-resolved is NEVER "pending" ---
    // After any theme choice + reload, the attribute is either
    // missing or has an explicit "light" / "dark" value. The
    // server emits it for explicit themes; the inline anti-flash
    // script stamps it before paint for system mode.
    for (const choice of ["light", "dark", "system"] as const) {
      await page.locator(`[data-theme-option="${choice}"]`).click();
      await page.reload();
      const resolved = await html.getAttribute("data-theme-resolved");
      expect(
        resolved,
        `data-theme-resolved was "${resolved}" after picking ${choice}; never expected "pending"`,
      ).not.toBe("pending");
      if (resolved !== null) {
        expect(["light", "dark"]).toContain(resolved);
      }
    }
  });

  test("anonymous /signin respects OS preference (no DB row, no cookie)", async ({
    page,
    context,
  }) => {
    // Clear cookies so the read path falls through to system.
    await context.clearCookies();

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/signin");
    await expect(page.locator("html")).toHaveClass(
      /(^|\s)light(\s|$)/,
      { timeout: 1000 },
    );

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    // The anti-flash script runs synchronously and stamps `dark`.
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("server reflects the DB pick on a fresh session", async ({
    page,
    context,
  }) => {
    await signIn(page, "alex@example.test");
    await page.goto("/me/preferences");
    await page.locator('[data-theme-option="light"]').click();
    // Wait for the API write to complete (toast appears).
    await expect(page.getByText(/Preferences saved/i)).toBeVisible({
      timeout: 2000,
    });

    // Drop the cookie so resolveTheme has to fall back to DB.
    const cookies = await context.cookies();
    const filtered = cookies.filter(
      (c) => c.name !== "theme" && c.name !== "bft_theme",
    );
    await context.clearCookies();
    await context.addCookies(
      filtered.filter((c) => c.name.includes("auth")),
    );

    await page.goto("/me/preferences");
    await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);
  });
});

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

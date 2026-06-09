import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-12 §1G.5 — theme picker live walk.
 *
 * Round-13 hotfix: migrated from form-submit signIn to JWT cookie
 * helper so the spec authenticates without hitting the password
 * form (form path was failing for every persona on this branch).
 */

const DARK_SURFACE = "rgb(17, 25, 39)";
const LIGHT_SURFACE = "rgb(243, 244, 246)";

test.describe("§1G theme picker", () => {
  test("optimistic flip + persists across reload + system mode honors OS", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/me/preferences");

    const html = page.locator("html");
    const body = page.locator("body");
    const savedToast = page.getByText(/Preferences saved/i);

    // Force a known non-light starting state so every pick below is
    // a real change (the picker no-ops when the clicked theme is
    // already active, and a no-op shows no save confirmation).
    const lightActive = await page
      .locator('[data-theme-option="light"]')
      .getAttribute("aria-checked");
    if (lightActive === "true") {
      await page.locator('[data-theme-option="dark"]').click();
      await expect(savedToast).toBeVisible({ timeout: 5000 });
      await page.reload();
    }

    // --- 1 + 2 + 3 — pick Light ---
    // The flip assertion stays tight (500ms) to prove the change is
    // optimistic. Crucially: wait for the save confirmation BEFORE
    // reloading — the optimistic flip resolves before the POST, and
    // a reload mid-flight cancels the save (this raced under full-
    // suite load).
    await page.locator('[data-theme-option="light"]').click();
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/, { timeout: 500 });
    await expect(savedToast).toBeVisible({ timeout: 5000 });

    await page.reload();
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/);
    await expect(body).toHaveCSS("background-color", LIGHT_SURFACE);

    // --- 4 — pick Dark ---
    await page.locator('[data-theme-option="dark"]').click();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 500 });
    await expect(savedToast).toBeVisible({ timeout: 5000 });
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
      // Same save-before-reload rule as above; the prior pick in
      // this loop is always a different theme, so a toast always
      // appears.
      await expect(page.getByText(/Preferences saved/i)).toBeVisible({
        timeout: 5000,
      });
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
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/me/preferences");
    // The picker no-ops (no save, no toast) when the clicked theme
    // is already active — and the persona's saved theme survives
    // between runs. Force a real state change: go dark first, then
    // light, so the light click is always a genuine save.
    await page.locator('[data-theme-option="dark"]').click();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
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

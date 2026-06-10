import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-18 §7 — portal magic links (user-reported: "the magic links
 * dont actually work. It takes you to a 'not found' page.").
 *
 * Root cause: the one-shot banner rendered a relative path as plain
 * text, and the token list rendered `/portal/<8-char-prefix>…` —
 * which LOOKS like the link but fails resolvePortalToken's minimum
 * length and 404s. This spec pins the fixed lifecycle: generate →
 * banner shows a full absolute URL that actually resolves →
 * regenerate issues a fresh working link and kills the old one.
 */

const prisma = new PrismaClient();

test.describe("§7 portal magic links", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("generate, visit, regenerate, old link dies", async ({ page }) => {
    const school = await prisma.school.findUnique({
      where: { code: "TEST-101" },
      select: { id: true },
    });
    expect(school, "TEST-101 fixture school missing").toBeTruthy();

    await signInAs(page, PERSONA.ADMIN);
    await page.goto(`/admin/schools/${school!.id}`);

    // Generate a link.
    await page
      .getByPlaceholder("e.g. Jane Doe · IT lead")
      .fill("E2E magic link check");
    await page.getByRole("button", { name: "Generate link", exact: true }).click();

    // The one-shot banner shows the FULL absolute URL (not a prefix,
    // not a relative path) plus a copy button.
    const banner = page.getByTestId("portal-token-once");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    const shown = await banner.locator("code").first().innerText();
    expect(shown).toMatch(/^https?:\/\/.+\/portal\/[A-Za-z0-9_-]{20,}$/);
    await expect(banner.getByTestId("copy-button")).toBeVisible();

    // The link actually works — the portal-scoped 404 carries a
    // data-not-found marker, so its absence means the token resolved.
    const url = new URL(shown);
    await page.goto(url.pathname);
    await expect(page.locator("[data-not-found]")).toHaveCount(0);

    // Regenerate from the token row: a fresh link appears and works…
    await page.goto(`/admin/schools/${school!.id}`);
    const row = page
      .locator("li", { hasText: "E2E magic link check" })
      .first();
    await row.getByRole("button", { name: "Regenerate link" }).click();
    const banner2 = page.getByTestId("portal-token-once");
    await expect(banner2).toBeVisible({ timeout: 15_000 });
    const shown2 = await banner2.locator("code").first().innerText();
    expect(shown2).not.toBe(shown);
    await page.goto(new URL(shown2).pathname);
    await expect(page.locator("[data-not-found]")).toHaveCount(0);

    // …and the original link is dead (revoked by the regenerate).
    await page.goto(url.pathname);
    await expect(page.locator('[data-not-found="portal"]')).toBeVisible();
  });
});

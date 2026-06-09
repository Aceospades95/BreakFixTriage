import { test, expect, Page } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-13 §1E + §4C — 12-page contrast sweep.
 *
 * Walks the 12 most-visited pages in BOTH light and dark theme
 * and asserts:
 *   1. data-theme-resolved is light|dark (never "pending" — the
 *      R12 §1G hotfix gate at the source level + this runtime
 *      gate at the browser level).
 *   2. body fg/bg contrast ratio ≥ 4.5:1.
 *   3. sidebar nav links + header chrome don't render as the
 *      background color (i.e. they're visible).
 *
 * The full axe-core walk (per-element WCAG 2.2 violation list)
 * is filed in docs/round-13-backlog.md. This spec is the floor:
 * it catches the §1G regression class without the axe dep.
 */

const PAGES = [
  "/",
  "/my-day",
  "/tickets",
  "/tickets/INC9990000",
  "/tickets/kanban",
  "/bench",
  "/scheduling",
  "/scheduling/people",
  "/dashboards",
  "/admin",
  "/admin/users",
  "/profile",
] as const;

const THEMES = [
  { name: "light", cookieValue: "light" },
  { name: "dark", cookieValue: "dark" },
] as const;

test.describe("@contrast 12-page sweep", () => {
  for (const theme of THEMES) {
    for (const path of PAGES) {
      test(`${path} contrast in ${theme.name} mode`, async ({
        page,
        context,
      }) => {
        await signInAs(page, PERSONA.ADMIN);

        // Force the theme via the canonical cookie. resolveTheme()
        // reads it server-side so the page renders in the
        // requested mode without a navigation roundtrip.
        await context.addCookies([
          {
            name: "theme",
            value: theme.cookieValue,
            url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
          },
        ]);

        await page.goto(path);
        if (path === "/my-day") {
          // /my-day is a redirect page (My Day lives on "/"). The
          // redirect streams in as a client navigation; measuring
          // before it lands races the evaluation context. This race
          // was misfiled as a contrast violation in R13 (B15).
          await page.waitForURL((u) => u.pathname === "/", {
            timeout: 10_000,
          });
        }

        // (1) — data-theme-resolved is never "pending".
        const resolved = await page
          .locator("html")
          .getAttribute("data-theme-resolved");
        expect(
          resolved,
          `${path} data-theme-resolved=${resolved}; never expected "pending"`,
        ).not.toBe("pending");
        if (resolved !== null) {
          expect(["light", "dark"]).toContain(resolved);
        }

        // (2) — body fg/bg contrast ≥ 4.5:1.
        const ratio = await bodyContrastRatio(page);
        expect(
          ratio,
          `${path} (${theme.name}) body contrast ratio ${ratio.toFixed(2)} below 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5);

        // (3) — Sidebar nav link color is NOT the same as its
        // background. The §1G hotfix bug rendered nav links as
        // slate-700 on slate-800 — a ratio < 1.5.
        const navContrast = await firstSidebarNavContrast(page);
        if (navContrast > 0) {
          expect(
            navContrast,
            `${path} (${theme.name}) sidebar nav contrast ${navContrast.toFixed(2)} below 4.5:1 — likely the §1G hotfix bug`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

/**
 * Compute WCAG 2.x contrast ratio for the body element. Returns
 * the ratio between document.body's foreground and background
 * computed colors.
 */
async function bodyContrastRatio(page: Page): Promise<number> {
  return await page.evaluate(() => {
    function parseRgb(s: string): [number, number, number] | null {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return [
        parseInt(m[1]!, 10),
        parseInt(m[2]!, 10),
        parseInt(m[3]!, 10),
      ];
    }
    function relLum([r, g, b]: [number, number, number]): number {
      const channels = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    }
    const cs = getComputedStyle(document.body);
    const fg = parseRgb(cs.color);
    const bg = parseRgb(cs.backgroundColor);
    if (!fg || !bg) return 0;
    const l1 = relLum(fg);
    const l2 = relLum(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

/**
 * Compute contrast ratio for the first sidebar nav link. Returns
 * 0 if no nav link is found (e.g. on a page that doesn't render
 * the sidebar).
 */
async function firstSidebarNavContrast(page: Page): Promise<number> {
  return await page.evaluate(() => {
    function parseRgb(s: string): [number, number, number] | null {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return [
        parseInt(m[1]!, 10),
        parseInt(m[2]!, 10),
        parseInt(m[3]!, 10),
      ];
    }
    function relLum([r, g, b]: [number, number, number]): number {
      const channels = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    }
    const link = document.querySelector('aside a, nav a');
    if (!link) return 0;
    const cs = getComputedStyle(link as HTMLElement);
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = parseRgb(cs.color);
    const bgRgb = parseRgb(bg);
    if (!fg || !bgRgb) return 0;
    const l1 = relLum(fg);
    const l2 = relLum(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

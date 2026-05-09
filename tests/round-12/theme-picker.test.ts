import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  classForTheme,
  isValidTheme,
  LEGACY_THEME_COOKIE_NAME,
  resolveTheme,
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_COOKIE_NAME,
} from "../../src/lib/theme/resolve";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1G — theme picker / read path tests.
 *
 * Pure-function unit tests for resolveTheme() per the §1G.5 spec.
 * Plus structural assertions on the layout / globals.css / API
 * route so a refactor doesn't silently regress.
 *
 * The full Playwright walk lives at e2e/theme-picker.spec.ts and
 * runs under the §1E Playwright runtime.
 */

describe("Round-12 §1G — resolveTheme", () => {
  it("anonymous + no cookie → 'system'", () => {
    expect(resolveTheme({ user: null })).toBe("system");
  });

  it("user.preferences.theme=light → 'light'", () => {
    expect(
      resolveTheme({ user: { preferences: { theme: "light" } } }),
    ).toBe("light");
  });

  it("user.preferences.theme=dark → 'dark'", () => {
    expect(
      resolveTheme({ user: { preferences: { theme: "dark" } } }),
    ).toBe("dark");
  });

  it("user.preferences.theme=system → 'system'", () => {
    expect(
      resolveTheme({ user: { preferences: { theme: "system" } } }),
    ).toBe("system");
  });

  it("cookieTheme=light, no user → 'light'", () => {
    expect(resolveTheme({ cookieTheme: "light" })).toBe("light");
  });

  it("cookieTheme=light AND user.preferences.theme=dark → 'dark' (DB wins)", () => {
    expect(
      resolveTheme({
        cookieTheme: "light",
        user: { preferences: { theme: "dark" } },
      }),
    ).toBe("dark");
  });

  it("legacy bft_theme cookie still resolves", () => {
    expect(resolveTheme({ legacyCookieTheme: "light" })).toBe("light");
    expect(resolveTheme({ legacyCookieTheme: "dark" })).toBe("dark");
  });

  it("legacy cookie loses to current cookie", () => {
    expect(
      resolveTheme({
        cookieTheme: "dark",
        legacyCookieTheme: "light",
      }),
    ).toBe("dark");
  });

  it("garbage values fall through to default", () => {
    expect(
      resolveTheme({
        cookieTheme: "magenta",
        legacyCookieTheme: "purple",
      }),
    ).toBe("system");
    expect(
      resolveTheme({
        user: { preferences: { theme: "neon" } },
      }),
    ).toBe("system");
  });
});

describe("Round-12 §1G — classForTheme", () => {
  it("light → 'light'", () => {
    expect(classForTheme("light")).toBe("light");
  });

  it("dark → 'dark'", () => {
    expect(classForTheme("dark")).toBe("dark");
  });

  it("system → null (no class; anti-flash script fills in)", () => {
    expect(classForTheme("system")).toBeNull();
  });
});

describe("Round-12 §1G — isValidTheme", () => {
  it("accepts the three documented values", () => {
    expect(isValidTheme("system")).toBe(true);
    expect(isValidTheme("light")).toBe(true);
    expect(isValidTheme("dark")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidTheme("auto")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme(null)).toBe(false);
    expect(isValidTheme(undefined)).toBe(false);
    expect(isValidTheme(123)).toBe(false);
  });
});

describe("Round-12 §1G — cookie + constant invariants", () => {
  it("cookie name is 'theme' (per §1G.3)", () => {
    expect(THEME_COOKIE_NAME).toBe("theme");
  });

  it("legacy cookie is 'bft_theme'", () => {
    expect(LEGACY_THEME_COOKIE_NAME).toBe("bft_theme");
  });

  it("max-age is one year (per §1G.3)", () => {
    expect(THEME_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 365);
  });
});

describe("Round-12 §1G — wiring", () => {
  it("root layout reads user.preferences.theme via resolveTheme", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toContain("resolveTheme");
    expect(src).toContain("classForTheme");
    expect(src).toContain("userPreference.findUnique");
    expect(src).toContain("getSession()");
  });

  it("root layout emits inline anti-flash script in <head>", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toContain("ANTI_FLASH_SCRIPT");
    expect(src).toMatch(/window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/);
    expect(src).toContain("dangerouslySetInnerHTML");
  });

  it("root layout stamps data-theme + data-theme-resolved on <html>", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toContain("data-theme={theme}");
    expect(src).toContain("data-theme-resolved=");
  });

  it("/api/me/theme exists and writes cookie + DB + audit", () => {
    expect(existsSync(join(ROOT, "src/app/api/me/theme/route.ts"))).toBe(true);
    const src = read("src/app/api/me/theme/route.ts");
    expect(src).toContain("cookies().set(THEME_COOKIE_NAME");
    expect(src).toContain("prisma.userPreference.upsert");
    expect(src).toContain('action: "theme.update"');
  });

  it("/api/me/theme rejects anonymous with 401", () => {
    const src = read("src/app/api/me/theme/route.ts");
    expect(src).toMatch(/if \(!session\)\s*\{[\s\S]*?status:\s*401/);
  });

  it("/api/me/theme validates input via zod enum", () => {
    const src = read("src/app/api/me/theme/route.ts");
    expect(src).toContain("isValidTheme");
    expect(src).toContain("z.string().refine(isValidTheme");
  });

  it("ThemePicker is a 'use client' island with optimistic update + revert", () => {
    const src = read("src/components/theme-picker.tsx");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain("Match system");
    expect(src).toContain('"/api/me/theme"');
    // Reverts on failure.
    expect(src).toMatch(/setTheme\(previous\)/);
    expect(src).toContain("Could not save theme");
    // System mode listens to prefers-color-scheme.
    expect(src).toContain("prefers-color-scheme: dark");
    expect(src).toContain('mq.addEventListener("change"');
  });

  it("ThemePicker is mounted on /me/preferences with no Save button for theme", () => {
    const src = read("src/app/(app)/me/preferences/page.tsx");
    expect(src).toContain("<ThemePicker");
    // The Save button stays for the digest fieldset, not the theme one.
    const themeBlock = src.match(/<fieldset[\s\S]*?ThemePicker[\s\S]*?<\/fieldset>/)?.[0] ?? "";
    expect(themeBlock).not.toContain('type="submit"');
  });

  it("globals.css inverts to light defaults + dark overrides", () => {
    const css = read("src/app/globals.css");
    // :root and :root.light share the light token block.
    expect(css).toMatch(/:root,\s*\n:root\.light/);
    // Dark values live under :root.dark only.
    expect(css).toMatch(/:root\.dark\s*\{[\s\S]*?--color-background:\s*17 25 39/);
    // Light values are in :root (default).
    expect(css).toMatch(/:root,\s*\n:root\.light\s*\{[\s\S]*?--color-background:\s*243 244 246/);
    // Semantic aliases per §1G.2.
    for (const tok of [
      "--surface",
      "--surface-raised",
      "--surface-overlay",
      "--border",
      "--border-strong",
      "--text",
      "--text-muted",
      "--text-subtle",
      "--accent",
      "--accent-foreground",
      "--danger",
      "--warning",
      "--success",
      "--info",
      "--ring",
    ]) {
      expect(css, `globals.css missing ${tok}`).toContain(tok);
    }
  });

  it("header ThemeToggle uses the new 'theme' cookie + fires /api/me/theme", () => {
    const src = read("src/components/theme-toggle.tsx");
    expect(src).toContain('const COOKIE = "theme"');
    expect(src).toContain('"/api/me/theme"');
  });

  it("e2e/theme-picker.spec.ts ships the live walk", () => {
    const path = join(ROOT, "e2e/theme-picker.spec.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("/me/preferences");
    expect(src).toContain("page.emulateMedia");
    expect(src).toContain("background-color");
  });
});

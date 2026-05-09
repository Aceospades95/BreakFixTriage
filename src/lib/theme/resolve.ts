/**
 * Round-12 §1G — theme resolution helper.
 *
 * The R3 picker on /me/preferences wrote `UserPreference.theme`
 * to the DB but no read path connected it to the rendered page.
 * `src/app/layout.tsx` only consulted the legacy `bft_theme`
 * cookie (set by the header `<ThemeToggle>`) — so a user who
 * picked Light on /me/preferences and reloaded saw the page stay
 * dark.
 *
 * resolveTheme() is the single source of truth. Priority order:
 *   1. user.preferences.theme  — when signed in (DB wins)
 *   2. cookie 'theme'          — for anonymous + speed boost
 *   3. cookie 'bft_theme'      — legacy fallback (R3 ThemeToggle)
 *   4. 'system'                — default for first-time visitors
 *
 * The returned value is the user's intent ('system' | 'light' |
 * 'dark'). classForTheme() converts intent → the class that
 * should be stamped on <html>: 'light' / 'dark' / null. A null
 * means the inline anti-flash script in `src/app/layout.tsx` will
 * read prefers-color-scheme and add the class before paint.
 */

export type Theme = "system" | "light" | "dark";

const VALID: ReadonlySet<string> = new Set(["system", "light", "dark"]);

export function isValidTheme(v: unknown): v is Theme {
  return typeof v === "string" && VALID.has(v);
}

export interface ResolveThemeInput {
  user?: { preferences?: { theme: string } | null } | null;
  cookieTheme?: string | null;
  legacyCookieTheme?: string | null;
}

export function resolveTheme(input: ResolveThemeInput): Theme {
  // DB wins when signed-in.
  const dbTheme = input.user?.preferences?.theme;
  if (isValidTheme(dbTheme)) return dbTheme;

  // Cookie fallback (R12 cookie name).
  if (isValidTheme(input.cookieTheme)) return input.cookieTheme;

  // Legacy cookie fallback. R3 ThemeToggle wrote 'bft_theme' with
  // values 'light' | 'dark' (no 'system'). Map onto Theme.
  if (
    input.legacyCookieTheme === "light" ||
    input.legacyCookieTheme === "dark"
  ) {
    return input.legacyCookieTheme;
  }

  return "system";
}

/**
 * Choose the class to stamp on <html> for server-side rendering.
 * Returns null for 'system' — the inline script in <head> reads
 * prefers-color-scheme and adds the class synchronously before
 * paint.
 */
export function classForTheme(theme: Theme): "light" | "dark" | null {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return null;
}

/**
 * Maximum cookie age for the theme cookie. One year, per the
 * §1G.3 spec. Long enough that returning users don't have to
 * re-pick; short enough that abandoned accounts eventually fall
 * back to system.
 */
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const THEME_COOKIE_NAME = "theme";
export const LEGACY_THEME_COOKIE_NAME = "bft_theme";

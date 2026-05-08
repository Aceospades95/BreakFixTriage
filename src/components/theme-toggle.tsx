"use client";

import { useEffect, useState } from "react";

/**
 * Header theme toggle — fast 2-state flip (light ↔ dark) on the
 * top bar.
 *
 * Round-12 §1G: switched the cookie name to `theme` so the root
 * layout's resolveTheme() reads the same source as
 * /api/me/theme. Posts to /api/me/theme best-effort so signed-in
 * users' DB stays in sync; anonymous users get a 401 which we
 * silently swallow (their cookie is the canonical store).
 *
 * The /me/preferences page hosts the full 3-state picker (system
 * / light / dark). This widget is the quick-flip; click cycles
 * between light and dark only.
 */
type Theme = "dark" | "light";

const COOKIE = "theme";
const LEGACY_COOKIE = "bft_theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const m = document.cookie.match(/(?:^|;\s*)theme=(dark|light|system)/);
  if (m && (m[1] === "dark" || m[1] === "light")) return m[1];
  // Fall back to the resolved class on <html> (root layout sets
  // it via resolveTheme() and the anti-flash script).
  if (document.documentElement.classList.contains("light")) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  // Legacy bft_theme fallback.
  const legacy = document.cookie.match(/(?:^|;\s*)bft_theme=(dark|light)/);
  if (legacy && (legacy[1] === "dark" || legacy[1] === "light")) {
    return legacy[1];
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.dataset.theme = theme;
  root.dataset.themeResolved = theme;
  // 1-year cookie per the §1G.3 spec. Same shape as
  // /api/me/theme writes server-side.
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  // Clear the legacy cookie if present so the read path doesn't
  // race two stores.
  document.cookie = `${LEGACY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = readTheme();
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    // Best-effort DB sync for signed-in users. Anonymous users
    // get a 401; we ignore — the cookie is the canonical store
    // for them anyway.
    void fetch("/api/me/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: next }),
      credentials: "same-origin",
    }).catch(() => {
      /* best-effort; ignore */
    });
  }

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className="rounded border border-transparent px-2 py-1 text-sm text-slate-400"
      >
        {" "}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      className="rounded border border-transparent px-2 py-1 text-sm text-slate-300 transition hover:border-surface-border hover:text-white"
    >
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}

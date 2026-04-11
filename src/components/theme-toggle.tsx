"use client";

import { useEffect, useState } from "react";

/**
 * Theme toggle.
 *
 * Stores the choice in a cookie so it survives reloads and is
 * readable from the server (via the root layout's theme class
 * initializer). On first render we mirror the cookie to the
 * `<html>` class so Tailwind's class-based dark mode picks it up.
 *
 * We intentionally don't use prefers-color-scheme automatically —
 * warehouse staff asked for a manual switch so they can choose
 * "dark for the warehouse, light for the van." Respect the user.
 */
type Theme = "dark" | "light";

const COOKIE = "bft_theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const match = document.cookie.match(/bft_theme=(dark|light)/);
  if (match && (match[1] === "dark" || match[1] === "light")) {
    return match[1];
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  // 180-day cookie so the choice persists roughly a semester.
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = readTheme();
    setTheme(current);
    applyTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  // Render a visually-hidden placeholder until the cookie is read so
  // the toggle doesn't flash the wrong icon on first paint.
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

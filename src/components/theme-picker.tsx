"use client";

import { useEffect, useState, useTransition } from "react";

/**
 * Round-12 §1G.4 — optimistic theme picker on /me/preferences.
 *
 * Click → immediate <html> class flip → POST /api/me/theme in the
 * background → success keeps the change + shows a toast → failure
 * reverts the class.
 *
 * No Save button. The Save button on the digest form upstream
 * stays for the daily-digest fields; theme writes
 * fire-and-confirm on each click.
 */

type Theme = "system" | "light" | "dark";

const OPTIONS: { value: Theme; label: string; help: string }[] = [
  {
    value: "system",
    label: "Match system",
    help: "Follows your OS preference; flips automatically when the OS does.",
  },
  { value: "light", label: "Light", help: "Always light, regardless of OS." },
  { value: "dark", label: "Dark", help: "Always dark, regardless of OS." },
];

export function ThemePicker({ initial }: { initial: string }) {
  const initialSafe: Theme = isTheme(initial) ? initial : "system";
  const [theme, setTheme] = useState<Theme>(initialSafe);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Round-12 §1G.4 — when theme === 'system', listen for OS-level
  // prefers-color-scheme changes and flip the <html> class
  // without a navigation. Required by the §1G.5 #6 acceptance
  // step.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function applySystem() {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(mq.matches ? "dark" : "light");
    }
    applySystem();
    mq.addEventListener("change", applySystem);
    return () => mq.removeEventListener("change", applySystem);
  }, [theme]);

  function applyVisual(t: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.dataset.theme = t;
    if (t === "light") {
      root.classList.add("light");
    } else if (t === "dark") {
      root.classList.add("dark");
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.add(prefersDark ? "dark" : "light");
    }
    root.dataset.themeResolved = root.classList.contains("dark")
      ? "dark"
      : "light";
  }

  function pick(next: Theme) {
    if (next === theme || pending) return;
    const previous = theme;
    setError(null);
    setTheme(next);
    applyVisual(next);

    startTransition(async () => {
      try {
        const res = await fetch("/api/me/theme", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ theme: next }),
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setSavedAt(Date.now());
      } catch (err) {
        // Revert.
        setTheme(previous);
        applyVisual(previous);
        setError("Could not save theme — please try again.");
      }
    });
  }

  // Auto-dismiss the saved-toast after 2s.
  useEffect(() => {
    if (savedAt == null) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <div data-testid="theme-picker">
      <div
        className="mt-2 flex flex-wrap gap-3 text-sm"
        role="radiogroup"
        aria-label="Theme"
      >
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-describedby={`theme-${opt.value}-help`}
              data-theme-option={opt.value}
              disabled={pending && !active}
              onClick={() => pick(opt.value)}
              className={
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition " +
                (active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-surface-border text-slate-300 hover:border-accent")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="sr-only" id="theme-system-help">
        {OPTIONS[0]!.help}
      </p>
      <p className="sr-only" id="theme-light-help">
        {OPTIONS[1]!.help}
      </p>
      <p className="sr-only" id="theme-dark-help">
        {OPTIONS[2]!.help}
      </p>
      <div
        className="mt-2 min-h-[1.25rem] text-xs"
        aria-live="polite"
        data-testid="theme-picker-status"
      >
        {error && <span className="text-red-300">{error}</span>}
        {!error && savedAt != null && (
          <span className="text-emerald-300">Preferences saved</span>
        )}
      </div>
    </div>
  );
}

function isTheme(v: string): v is Theme {
  return v === "system" || v === "light" || v === "dark";
}

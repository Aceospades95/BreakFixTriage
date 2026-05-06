"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts. Mounted once in the authenticated
 * layout so every page gets them.
 *
 * Patterns:
 *   `/`        → focus the global search box (wired elsewhere)
 *   `?`        → toggle the cheat-sheet overlay
 *   `g t`      → go to tickets
 *   `g q`      → go to quotes
 *   `g s`      → go to scheduling
 *   `g k`      → go to kanban
 *   `g m`      → go to my-day
 *   `g b`      → go to bench
 *   `g c`      → go to scan
 *   `g i`      → go to imports
 *   `g d`      → go to dashboards
 *
 * The `g` leader is standard in productivity tools (Gmail, Linear,
 * GitHub) and gives us room to grow into two-key chords.
 */
const SHORTCUTS: { keys: string; label: string; href?: string; hint?: string }[] = [
  { keys: "/", label: "Focus search" },
  { keys: "?", label: "Toggle this cheat-sheet" },
  { keys: "g t", label: "Tickets", href: "/tickets" },
  { keys: "g q", label: "Quotes", href: "/quotes" },
  { keys: "g s", label: "Scheduling", href: "/scheduling" },
  { keys: "g k", label: "Kanban", href: "/tickets/kanban" },
  { keys: "g m", label: "My day", href: "/" },
  { keys: "g b", label: "Bench", href: "/bench" },
  { keys: "g c", label: "Scan", href: "/scan" },
  { keys: "g i", label: "Imports", href: "/imports" },
  { keys: "g d", label: "Dashboards", href: "/dashboards" },
];

const ROUTES: Record<string, string> = Object.fromEntries(
  SHORTCUTS.filter((s) => s.href).map((s) => [s.keys.slice(-1), s.href!]),
);

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [leader, setLeader] = useState(false);

  useEffect(() => {
    let leaderTimer: ReturnType<typeof setTimeout> | null = null;

    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOverlayOpen((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        setOverlayOpen(false);
        setLeader(false);
        if (leaderTimer) clearTimeout(leaderTimer);
        return;
      }

      if (leader) {
        const href = ROUTES[e.key];
        setLeader(false);
        if (leaderTimer) clearTimeout(leaderTimer);
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setLeader(true);
        if (leaderTimer) clearTimeout(leaderTimer);
        leaderTimer = setTimeout(() => setLeader(false), 1200);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (leaderTimer) clearTimeout(leaderTimer);
    };
  }, [leader, router]);

  return (
    <>
      {leader && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-accent/60 bg-surface-muted/90 px-4 py-1.5 text-xs font-medium tracking-tight text-slate-200 shadow-lg backdrop-blur">
          g _
        </div>
      )}
      {overlayOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={() => setOverlayOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-surface-border bg-surface-muted p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setOverlayOpen(false)}
                className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
              >
                close
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.keys}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-border/40"
                >
                  <span className="text-slate-300">{s.label}</span>
                  <span className="font-medium tracking-tight text-xs text-accent">
                    {s.keys}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-slate-500">
              Shortcuts are disabled while you're typing in a form field.
              Press <span className="font-medium tracking-tight text-accent">Esc</span> to
              close any open overlay.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

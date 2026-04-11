"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppEvents } from "./use-app-events";

/**
 * Auto-refresh control.
 *
 * Mounted on "live" pages (kanban, dashboards) so a dispatcher can
 * leave the page open on a wall display and see updates without
 * pressing reload.
 *
 * Two mechanisms run in tandem:
 *
 *  1. **Server-Sent Events** — always on. Any time a ticket/route
 *     transition fires on the server, the bus publishes an event,
 *     the SSE endpoint pushes it, and this component refreshes the
 *     route. Updates are near-instant and cost nothing when idle.
 *
 *  2. **Polling fallback** — off by default. If a user explicitly
 *     enables the interval checkbox (because they're behind a
 *     long-poll-hostile proxy, or they just want a visual
 *     countdown), we also poll every N seconds. The two mechanisms
 *     are independent — either one can trigger a refresh.
 *
 * Polling preference persists in localStorage so a tablet that
 * lives on the wall comes back up in the same state.
 */
export function AutoRefresh({
  storageKey,
  intervalSeconds = 30,
}: {
  storageKey: string;
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [countdown, setCountdown] = useState(intervalSeconds);

  // SSE — always on. Ticket list pages and the kanban both care
  // about both per-ticket and bulk changes.
  useAppEvents(["tickets.changed", "tickets.bulk-changed", "routes.changed"]);

  // Restore persisted preference on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1") setEnabled(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Persist on change.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [enabled, storageKey]);

  // Polling tick + refresh loop (optional fallback).
  useEffect(() => {
    if (!enabled) {
      setCountdown(intervalSeconds);
      return;
    }
    let seconds = intervalSeconds;
    setCountdown(seconds);
    const handle = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        router.refresh();
        seconds = intervalSeconds;
      }
      setCountdown(seconds);
    }, 1000);
    return () => clearInterval(handle);
  }, [enabled, intervalSeconds, router]);

  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
        title="Live updates via SSE are active"
        aria-hidden="true"
      />
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="accent-accent"
        aria-label="Also poll on interval"
      />
      Auto-refresh
      {enabled && (
        <span className="font-mono text-[10px] text-slate-500">
          {countdown}s
        </span>
      )}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-refresh control.
 *
 * Mounted on "live" pages (kanban, dashboards) so a dispatcher can
 * leave the page open on a wall display and see updates without
 * pressing reload. Calls `router.refresh()` on an interval, which
 * re-runs the server components without a full page reload.
 *
 * Off by default to avoid surprise DB load; the user toggles it on
 * per page. The choice persists in localStorage so a tablet that
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

  // Tick + refresh loop.
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
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="accent-accent"
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

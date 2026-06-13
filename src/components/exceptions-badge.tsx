"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Round-16 (D2) — topbar exceptions badge.
 *
 * Renders nothing while loading or when every monitored failure
 * mode is clear; shows an amber count linking to /admin/exceptions
 * otherwise. Mounted only for admins (the count endpoint 401s for
 * anyone else, and the catch below treats that as "no badge").
 * Refreshes every 5 minutes; the page itself stays the source of
 * truth.
 */
export function ExceptionsBadge() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lastLoadedAt = 0;
    async function load() {
      // Backgrounded tabs skip the refresh entirely; they catch up
      // on the next visibilitychange. Keeps N idle tabs from each
      // running the count queries on their own timer.
      if (document.visibilityState === "hidden") return;
      lastLoadedAt = Date.now();
      try {
        const res = await fetch("/api/exceptions/count", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { total?: number };
        if (!cancelled && typeof body.total === "number") {
          setTotal(body.total);
        }
      } catch {
        // Transient failure — keep whatever we had.
      }
    }
    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadedAt > REFRESH_MS
      ) {
        void load();
      }
    }
    void load();
    const t = setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!total) return null;

  return (
    <Link
      href="/admin/exceptions"
      data-testid="exceptions-badge"
      title={`${total} exception${total === 1 ? "" : "s"} need attention`}
      className="flex h-8 items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/15 px-2.5 text-xs font-semibold text-amber-200 transition hover:border-amber-400"
    >
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-400" />
      <span className="tabular-nums">{total}</span>
      <span className="sr-only">open exceptions</span>
    </Link>
  );
}

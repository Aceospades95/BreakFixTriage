"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

/**
 * Toast host.
 *
 * Server actions redirect with `?ok=...` or `?error=...` on success
 * and failure. That's a decent story for reload-based navigation,
 * but the query string lingers in the URL and the banner only
 * shows up once the user scrolls to it. This component does three
 * things on every navigation:
 *
 *   1. Reads the `ok` / `error` params, if any.
 *   2. Pops a fixed-position toast with the message.
 *   3. Strips the params from the URL via `router.replace` so
 *      clicking "back" doesn't re-trigger the same toast.
 *
 * The toast auto-dismisses after 4 seconds; clicking ✕ closes
 * immediately. Kept pure-client and framework-free so it stays
 * under 1 KB and works regardless of how the message got there.
 */

interface Toast {
  id: number;
  kind: "ok" | "error";
  message: string;
}

export function ToastHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const ok = searchParams.get("ok");
    const error = searchParams.get("error");
    if (!ok && !error) return;

    const next: Toast[] = [];
    if (ok) {
      next.push({ id: Date.now(), kind: "ok", message: ok });
    }
    if (error) {
      next.push({ id: Date.now() + 1, kind: "error", message: error });
    }
    setToasts((prev) => [...prev, ...next]);

    // Strip the params from the URL so a refresh doesn't re-toast.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("ok");
    nextParams.delete("error");
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    // Auto-dismiss each toast after 4s.
    const timers = next.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000),
    );
    return () => {
      for (const h of timers) clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-xl backdrop-blur ${
            t.kind === "ok"
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
              : "border-red-500/60 bg-red-500/15 text-red-100"
          }`}
        >
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
            {t.kind === "ok" ? "ok" : "error"}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            className="ml-2 text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

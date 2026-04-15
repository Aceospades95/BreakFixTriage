"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

/**
 * Toast host.
 *
 * Server actions redirect with `?ok=...` or `?error=...` on success
 * and failure. This component:
 *
 *   1. Reads the `ok` / `error` params, if any.
 *   2. Pops a fixed-position toast with the message.
 *   3. Strips the params from the URL via `router.replace` so
 *      clicking "back" doesn't re-trigger the same toast.
 *
 * Lifecycle per toast:
 *   t=0s      shown (opacity 0 → 1 on mount)
 *   t=3.5s    fade begins (opacity 1 → 0 over 0.5s)
 *   t=4s      removed from DOM
 *
 * Users can also click ✕ to dismiss immediately (triggers same fade).
 */

interface Toast {
  id: number;
  kind: "ok" | "error";
  message: string;
  fading: boolean;
}

const SHOW_MS = 3500;
const FADE_MS = 500;

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
      next.push({ id: Date.now(), kind: "ok", message: ok, fading: false });
    }
    if (error) {
      next.push({
        id: Date.now() + 1,
        kind: "error",
        message: error,
        fading: false,
      });
    }
    setToasts((prev) => [...prev, ...next]);

    // Strip the params from the URL so a refresh doesn't re-toast.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("ok");
    nextParams.delete("error");
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    // Start fade after SHOW_MS, remove from DOM after SHOW_MS + FADE_MS.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of next) {
      timers.push(
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((x) => (x.id === t.id ? { ...x, fading: true } : x)),
          );
        }, SHOW_MS),
      );
      timers.push(
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, SHOW_MS + FADE_MS),
      );
    }
    return () => {
      for (const h of timers) clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  function dismiss(id: number) {
    // Trigger fade, then remove.
    setToasts((prev) =>
      prev.map((x) => (x.id === id ? { ...x, fading: true } : x)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, FADE_MS);
  }

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
          style={{
            transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
            opacity: t.fading ? 0 : 1,
            transform: t.fading ? "translateY(8px)" : "translateY(0)",
          }}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-xl backdrop-blur ${
            t.kind === "ok"
              ? "border-success/60 bg-success/15 text-emerald-100"
              : "border-destructive/60 bg-destructive/15 text-red-100"
          }`}
        >
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">
            {t.kind === "ok" ? "ok" : "error"}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="ml-2 text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

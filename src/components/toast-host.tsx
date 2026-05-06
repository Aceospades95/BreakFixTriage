"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

/**
 * Toast host.
 *
 * Server actions redirect with `?ok=...` or `?error=...` on success
 * and failure. This component:
 *
 *   1. Reads the `ok` / `error` params, if any. Optional `?important=1`
 *      keeps the toast visible until manually dismissed (Round-3 §I).
 *   2. Pops a fixed-position toast with the message.
 *   3. Strips the params from the URL via `router.replace` so
 *      clicking "back" doesn't re-trigger the same toast.
 *
 * Lifecycle per non-important toast:
 *   t=0s      shown (opacity 0 → 1 on mount)
 *   t=5s      fade begins (opacity 1 → 0 over 0.5s)
 *   t=5.5s    removed from DOM
 *
 * `important` toasts skip the fade timer; users dismiss with ✕
 * (the X button is always rendered, every variant). The Undo
 * affordance for destructive ops is `?undo=<token>` — a server
 * action receives the token and reverses the last action; today
 * Undo is only used by the merge-then-immediately-undo flow
 * (Round-3 §D).
 *
 * Round-3 §I rationale:
 *   - 5s default (was 3.5s) — operators reading the message had
 *     too little time, especially for multi-line errors.
 *   - X button always present, regardless of variant.
 *   - Pointer-events on the panel only, not on the wrapper, so a
 *     visible toast doesn't block clicks on the page underneath.
 *     (Already true since Round-1; preserved.)
 */

interface Toast {
  id: number;
  kind: "ok" | "error" | "important";
  message: string;
  fading: boolean;
  /** Optional Undo affordance — when set, renders an Undo button
      that links to the server action that reverses the last op. */
  undoHref?: string;
}

const SHOW_MS = 5000;
const FADE_MS = 500;

export function ToastHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const ok = searchParams.get("ok");
    const error = searchParams.get("error");
    const important = searchParams.get("important") === "1";
    const undoHref = searchParams.get("undo") ?? undefined;
    if (!ok && !error) return;

    const next: Toast[] = [];
    if (ok) {
      next.push({
        id: Date.now(),
        // important success toasts (e.g. merge complete with Undo)
        // become the dedicated `important` variant.
        kind: important ? "important" : "ok",
        message: ok,
        fading: false,
        undoHref,
      });
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
    nextParams.delete("important");
    nextParams.delete("undo");
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    // Start fade after SHOW_MS, remove from DOM after SHOW_MS + FADE_MS.
    // `important` toasts skip the auto-fade — they stay until the
    // user clicks the X. Round-3 §I rationale: merge / un-merge /
    // bulk-close confirmations want the operator to read the
    // outcome before acknowledging.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of next) {
      if (t.kind === "important") continue;
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
      {toasts.map((t) => {
        const cls =
          t.kind === "error"
            ? "border-destructive/60 bg-destructive/15 text-red-100"
            : t.kind === "important"
              ? "border-amber-500/60 bg-amber-500/15 text-amber-100"
              : "border-success/60 bg-success/15 text-emerald-100";
        const role = t.kind === "error" ? "alert" : "status";
        const ariaLive = t.kind === "error" ? "assertive" : "polite";
        return (
          <div
            key={t.id}
            role={role}
            aria-live={ariaLive}
            style={{
              transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
              opacity: t.fading ? 0 : 1,
              transform: t.fading ? "translateY(8px)" : "translateY(0)",
            }}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-xl backdrop-blur ${cls}`}
          >
            <span className="mt-0.5 text-[10px] font-semibold tracking-wider opacity-70">
              {/* Round-3 §29: tracking-wider replaces uppercase so the
                  badge label isn't ALL CAPS (humanised). */}
              {t.kind === "error" ? "Error" : t.kind === "important" ? "Heads up" : "OK"}
            </span>
            <span className="flex-1">{t.message}</span>
            {t.undoHref && (
              <a
                href={t.undoHref}
                className="ml-2 rounded border border-amber-200/50 px-2 py-0.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Undo
              </a>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="ml-2 text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

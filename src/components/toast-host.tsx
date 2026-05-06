"use client";

import { useEffect, useRef, useState } from "react";
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
 * Lifecycle per non-important toast (Round-4 §pre-work-1 tweaks):
 *   t=0s      shown (opacity 0 → 1 on mount)
 *   t=4s      fade begins (opacity 1 → 0 over 0.5s) *unless* the
 *             pointer is currently over the panel
 *   t=4.5s    removed from DOM
 *
 * Hovering the panel pauses the dismiss timer; leaving the panel
 * resumes from where it left off. Round-4 §pre-work-1 changes:
 *
 *   - SHOW_MS bumped 5s → 4s (matches the brief's documented
 *     default; the 5s in Round-3 was an overshoot).
 *   - FIFO: when a new toast arrives while another is already
 *     visible, the new one stacks below; the timers run
 *     independently so they each fade after their own 4s.
 *   - Pause-on-hover: a single `paused` flag at the host level;
 *     when set, every toast's timer is treated as suspended.
 *     Implementation uses an effect-cleanup-and-reschedule
 *     pattern so a paused toast that the user un-hovers gets a
 *     fresh remaining-time timer.
 *
 * `important` toasts skip the fade timer entirely; users dismiss
 * with the X button (always rendered, every variant). The Undo
 * affordance for destructive ops is `?undo=<token>` — a server
 * action receives the token and reverses the last action; today
 * Undo is only used by the merge-then-immediately-undo flow
 * (Round-3 §D).
 */

interface Toast {
  id: number;
  kind: "ok" | "error" | "important";
  message: string;
  fading: boolean;
  /** Optional Undo affordance — when set, renders an Undo button
      that links to the server action that reverses the last op. */
  undoHref?: string;
  /** Per-toast remaining-time bookkeeping. The host keeps an
      `expiresAt` so a hover-pause can compute the new timeout
      without losing time. */
  expiresAt: number | null; // null for `important`
}

const SHOW_MS = 4000;
const FADE_MS = 500;

export function ToastHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const ok = searchParams.get("ok");
    const error = searchParams.get("error");
    const important = searchParams.get("important") === "1";
    const undoHref = searchParams.get("undo") ?? undefined;
    if (!ok && !error) return;

    const now = Date.now();
    const next: Toast[] = [];
    if (ok) {
      next.push({
        id: now,
        // important success toasts (e.g. merge complete with Undo)
        // become the dedicated `important` variant.
        kind: important ? "important" : "ok",
        message: ok,
        fading: false,
        undoHref,
        expiresAt: important ? null : now + SHOW_MS,
      });
    }
    if (error) {
      next.push({
        id: now + 1,
        kind: "error",
        message: error,
        fading: false,
        expiresAt: now + SHOW_MS,
      });
    }
    // FIFO stacking: append. The host renders in array order so
    // older toasts sit on top; new arrivals slide in below.
    setToasts((prev) => [...prev, ...next]);

    // Strip the params from the URL so a refresh doesn't re-toast.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("ok");
    nextParams.delete("error");
    nextParams.delete("important");
    nextParams.delete("undo");
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    // The per-toast dismiss timers live in a separate effect that
    // watches `toasts` + `paused` so pause-on-hover can suspend
    // and resume cleanly. The query-param effect just enqueues;
    // the ticker effect below owns the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  // Round-4 §pre-work-1: pause-on-hover at the host level. While
  // `paused`, every visible toast keeps its current `expiresAt`
  // and we don't schedule a fade timer. On unpause, each toast
  // computes its remaining time and re-arms.
  useEffect(() => {
    if (paused) return;
    const handles: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();
    for (const t of toasts) {
      if (t.fading) continue;
      if (t.kind === "important" || t.expiresAt == null) continue;
      const ms = Math.max(0, t.expiresAt - now);
      handles.push(
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((x) => (x.id === t.id ? { ...x, fading: true } : x)),
          );
          handles.push(
            setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, FADE_MS),
          );
        }, ms),
      );
    }
    return () => {
      for (const h of handles) clearTimeout(h);
    };
  }, [toasts, paused]);

  // Push every visible toast's expiresAt forward by the time
  // elapsed during the pause. Implementation: snapshot the
  // pause start; on resume, add the delta to every non-important
  // toast's expiresAt. The re-scheduling above then arms with
  // the correct remaining time.
  const pauseStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (paused) {
      pauseStartRef.current = Date.now();
      return;
    }
    const start = pauseStartRef.current;
    if (start == null) return;
    const delta = Date.now() - start;
    pauseStartRef.current = null;
    if (delta <= 0) return;
    setToasts((prev) =>
      prev.map((t) =>
        t.expiresAt == null ? t : { ...t, expiresAt: t.expiresAt + delta },
      ),
    );
  }, [paused]);

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
            // Round-4 §pre-work-1: hover pauses the auto-dismiss
            // timer, leave resumes from where it left off. The
            // host-level `paused` flag covers any toast in the
            // stack (FIFO arrivals respect the same pause).
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
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

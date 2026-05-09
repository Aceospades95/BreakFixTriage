import type { ReactNode } from "react";

/**
 * Round-13 §3C — shared empty-state component.
 *
 * Replaces ad-hoc emoji-only empty states (e.g. /invoices used a
 * single 🎉 glyph) with a structured icon + headline + body +
 * optional CTA. New code should adopt this component on every
 * empty-list / nothing-to-do panel.
 *
 * The default `icon` is a check-circle-bigger glyph in slate-500
 * — tonally neutral, communicates "all clear" without the
 * celebratory emoji that read as flippant in operator copy.
 */
export function EmptyState({
  headline,
  body,
  icon,
  cta,
  className,
}: {
  headline: string;
  body?: string;
  icon?: ReactNode;
  cta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-empty-state
      className={
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-surface-border bg-surface-muted/30 px-6 py-12 text-center " +
        (className ?? "")
      }
    >
      <span aria-hidden="true" className="text-slate-500">
        {icon ?? <CircleCheckBigIcon />}
      </span>
      <h2 className="text-sm font-semibold text-slate-200">{headline}</h2>
      {body && (
        <p className="max-w-md text-xs leading-relaxed text-slate-400">
          {body}
        </p>
      )}
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}

/**
 * Minimal SVG copy of lucide's `circle-check-big` glyph. Inlined
 * because the codebase has no icon library dep — and adding one
 * for a single shared empty state isn't worth the build-time cost.
 */
function CircleCheckBigIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

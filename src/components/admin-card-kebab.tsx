"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Round-11 §1D — admin card kebab popover.
 *
 * Sits in the top-right of every /admin overview card and exposes
 * the documented quick actions per card type. Keyboard accessible:
 *
 *   - Tab to focus the kebab button
 *   - Enter / Space to open
 *   - ↑↓ to move between actions
 *   - Enter to fire the highlighted action
 *   - Esc to close
 *
 * Click outside the popover closes it. The trigger is rendered
 * inside an absolutely-positioned container so it sits ON TOP of
 * the parent card's link without making the card itself
 * unclickable.
 */

export interface KebabAction {
  /** Visible label. */
  label: string;
  /** Optional href for navigate-on-click items. */
  href?: string;
  /** Optional server-action form for destructive items. */
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Hidden inputs to send with the form, e.g. ids. */
  formFields?: Record<string, string>;
  /** When set, render a confirm prompt before submitting. */
  confirm?: string;
  /**
   * When true, render with subdued styling. Used for destructive
   * actions like "Reset to defaults" so accidental clicks read as
   * dangerous.
   */
  destructive?: boolean;
}

export function AdminCardKebab({ actions }: { actions: KebabAction[] }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      e.stopPropagation();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(actions.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      const a = actions[highlighted];
      if (!a) return;
      if (a.href) {
        e.preventDefault();
        window.location.href = a.href;
      }
      // formAction items: let the native button click bubble.
    }
  }

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
          setHighlighted(0);
        }}
        className="rounded p-1 text-slate-400 transition hover:bg-surface-muted hover:text-white focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <span aria-hidden="true" className="block leading-none">
          ⋯
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[16rem] overflow-hidden rounded border border-surface-border bg-surface shadow-xl"
        >
          {actions.map((a, idx) => {
            const isHi = idx === highlighted;
            const tone = a.destructive ? "text-red-300" : "text-slate-200";
            const bg = isHi ? "bg-accent/15" : "hover:bg-surface-muted";
            const className = `block w-full px-3 py-1.5 text-left text-xs ${tone} ${bg}`;
            if (a.href) {
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  role="menuitem"
                  onMouseEnter={() => setHighlighted(idx)}
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {a.label}
                </Link>
              );
            }
            if (a.formAction) {
              return (
                <form
                  key={a.label}
                  action={a.formAction}
                  onSubmit={(e) => {
                    if (a.confirm && !window.confirm(a.confirm)) {
                      e.preventDefault();
                      return;
                    }
                    setOpen(false);
                  }}
                >
                  {Object.entries(a.formFields ?? {}).map(([n, v]) => (
                    <input key={n} type="hidden" name={n} value={v} />
                  ))}
                  <button
                    type="submit"
                    role="menuitem"
                    onMouseEnter={() => setHighlighted(idx)}
                    className={className}
                  >
                    {a.label}
                  </button>
                </form>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Submit button that pops a native `confirm()` before allowing the
 * form to submit. Not fancy — but it stops the one-click-and-your-
 * route-is-gone footgun that Phase 2 shipped with, without needing
 * a heavier modal component. A nicer dialog can replace this later
 * without touching call sites.
 */
export function ConfirmButton({
  children,
  message,
  className,
  disabled = false,
}: {
  children: ReactNode;
  message: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
      className={cn(
        "rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

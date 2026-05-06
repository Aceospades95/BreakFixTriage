"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for every page in the (app) route group. Next.js
 * renders this automatically when a server component or server
 * action throws. We log the error to the browser console (so
 * browser devtools pick it up) and show a recovery affordance —
 * the user can retry or navigate home instead of being stuck on a
 * broken page.
 *
 * Authorization errors bubble up here too (when requireRole
 * throws), so the message hints at that case.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", error);
  }, [error]);

  const isAuthError = /AuthorizationError/.test(error.message);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-red-500/40 bg-red-500/10 p-6">
      <h1 className="text-xl font-semibold text-red-100">
        {isAuthError ? "Access denied" : "Something broke on this page"}
      </h1>
      <p className="text-sm text-red-200/80">
        {isAuthError
          ? "Your role does not have permission to view or perform this action. If you think this is wrong, ask an administrator."
          : error.message || "An unexpected error occurred."}
      </p>
      {error.digest && (
        <p className="font-medium tracking-tight text-xs text-red-300/60">
          digest: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-500/30"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-200 hover:border-accent"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

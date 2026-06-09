"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for every page in the (app) route group. Next.js
 * renders this automatically when a server component or server
 * action throws.
 *
 * Round-13 §1H — user-facing message is generic; only a short
 * support code (first 8 chars of the digest, uppercased) is shown
 * so an operator on a phone call can read it back. Full digest +
 * full error message are logged server-side via `console.error`
 * (Next.js streams the digest to the server logs automatically;
 * the client stack traces also appear in browser devtools).
 *
 * Authorization errors keep their distinct copy because they're
 * actionable (ask an admin) rather than mysterious.
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
  const supportCode = error.digest
    ? error.digest.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()
    : null;
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <div
      data-testid="global-error-boundary"
      className="mx-auto max-w-2xl space-y-4 rounded-lg border border-red-500/40 bg-red-500/10 p-6"
    >
      <h1 className="text-xl font-semibold text-red-100">
        {isAuthError ? "Access denied" : "Something went wrong"}
      </h1>
      <p className="text-sm text-red-200/80">
        {isAuthError
          ? "Your role does not have permission to view or perform this action. If you think this is wrong, ask an administrator."
          : "We've been notified. Try again, or head home and try a different path."}
      </p>
      {supportCode && (
        <p className="text-xs text-red-300/60">
          Reference: <span data-testid="support-code">{supportCode}</span>
        </p>
      )}
      {isDevelopment && (
        <details className="text-xs text-red-300/60">
          <summary>Developer details</summary>
          <pre className="whitespace-pre-wrap break-all p-2 text-[10px] text-red-200/70">
            {error.message}
          </pre>
        </details>
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

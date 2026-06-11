"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Sign-in form with optional 2FA input.
 *
 * The TOTP field is always visible but marked as optional — users
 * who don't have 2FA enabled just leave it blank. Users who do
 * have it enabled get rejected with a clear message if they skip
 * it. We deliberately don't do a two-step "check if 2FA is on
 * first" UX because that leaks which accounts have 2FA.
 */
export function SignInForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? mapError(initialError) : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", {
      email: email.trim(),
      password,
      totpCode: totpCode.trim(),
      redirect: false,
      callbackUrl,
    });
    setSubmitting(false);
    if (!result) {
      setError("Sign-in failed unexpectedly.");
      return;
    }
    if (result.error) {
      setError(mapError(result.error));
      return;
    }
    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  return (
    // method="post" matters: if the form is submitted before React
    // hydrates (slow network, tablet), the browser falls back to a
    // native submit. Without it that fallback is a GET that puts the
    // password in the URL, browser history, and server logs.
    <form method="post" onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Email
        </span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1 block w-full rounded border border-surface-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Password
        </span>
        <input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded border border-surface-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Authenticator code
          <span className="ml-2 normal-case text-slate-500">
            (leave blank if 2FA is off)
          </span>
        </span>
        <input
          type="text"
          name="totpCode"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d{6}|[A-Za-z0-9-]{16,24}"
          placeholder="123456 or recovery code"
          className="mt-1 block w-full rounded border border-surface-border bg-surface px-3 py-2 font-medium tracking-tight text-sm focus:border-accent focus:outline-none"
        />
      </label>

      {error && (
        <div
          role="alert"
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function mapError(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "Invalid email, password, or authenticator code.";
    case "AccessDenied":
      return "Your account is not permitted to sign in.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

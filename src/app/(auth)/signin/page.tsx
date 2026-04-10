import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  return (
    <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-muted p-8 shadow-xl">
      <h1 className="text-2xl font-semibold tracking-tight">BreakFix Triage</h1>
      <p className="mt-1 text-sm text-slate-400">
        Sign in to continue to the operations console.
      </p>

      <SignInForm
        callbackUrl={searchParams?.callbackUrl ?? "/"}
        initialError={searchParams?.error ?? null}
      />

      <p className="mt-6 text-xs text-slate-500">
        Forgot your password? Contact an operations manager or the admin
        who provisioned your account.
      </p>
    </div>
  );
}

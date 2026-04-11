import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const readOnly = process.env.READ_ONLY_MODE === "true";

  return (
    <div className="flex min-h-screen flex-col">
      {readOnly && (
        <div className="border-b border-amber-500/40 bg-amber-500/20 px-6 py-2 text-center text-xs font-semibold text-amber-100">
          BreakFix Triage is in READ-ONLY MODE — writes are rejected at
          the edge. Flip <code className="font-mono">READ_ONLY_MODE</code>{" "}
          off once the cutover window closes.
        </div>
      )}
      <header className="border-b border-surface-border bg-surface-muted/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-slate-100"
          >
            BreakFix Triage
          </Link>
          <NavLinks />
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className="font-medium text-slate-100">{session.name}</div>
              <div className="font-mono uppercase tracking-wide text-slate-400">
                {session.role}
              </div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

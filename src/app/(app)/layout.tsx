import { Suspense } from "react";
import Link from "next/link";
import { GlobalSearch } from "@/components/global-search";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { NavLinks } from "@/components/nav-links";
import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastHost } from "@/components/toast-host";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const readOnly = process.env.READ_ONLY_MODE === "true";
  const isAdmin = session.role === "ADMIN";
  const notifications = await prisma.inAppNotification.findMany({
    where: { recipientUserId: session.userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950"
      >
        Skip to main content
      </a>
      <KeyboardShortcuts />
      {readOnly && (
        <div className="border-b border-amber-500/40 bg-amber-500/20 px-6 py-2 text-center text-xs font-semibold text-amber-100">
          BreakFix Triage is in READ-ONLY MODE — writes are rejected at
          the edge. Flip <code className="font-mono">READ_ONLY_MODE</code>{" "}
          off once the cutover window closes.
        </div>
      )}
      <header className="border-b border-surface-border bg-surface-muted/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-slate-100"
          >
            BreakFix Triage
          </Link>
          <NavLinks isAdmin={isAdmin} />
          <div className="flex items-center gap-3">
            <GlobalSearch />
            <ThemeToggle />
            <NotificationBell notifications={notifications} />
            <Link
              href="/profile"
              className="text-right text-xs transition hover:text-white"
            >
              <div className="font-medium text-slate-100">{session.name}</div>
              <div className="font-mono uppercase tracking-wide text-slate-400">
                {session.role}
              </div>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 focus:outline-none"
        tabIndex={-1}
      >
        {children}
      </main>
      <Suspense fallback={null}>
        <ToastHost />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import type { Role } from "@prisma/client";
import { GlobalSearch } from "@/components/global-search";
import { HelpMenu } from "@/components/help-menu";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { NotificationBell } from "@/components/notification-bell";
import { AppShell } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastHost } from "@/components/toast-host";
import { CommandPalette } from "@/components/command-palette";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { touchSession } from "@/lib/auth/sessions";
import { formatRole } from "@/lib/format";

const MANAGER_ROLES: Role[] = ["ADMIN", "OPS_MANAGER", "DISPATCHER"];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const readOnly = process.env.READ_ONLY_MODE === "true";
  const isAdmin = session.role === "ADMIN";
  const isManager = MANAGER_ROLES.includes(session.role);

  // Round-11 §1C — debounced session touch on every authenticated
  // page request. Safe to fire-and-forget: failure must not block
  // the layout render.
  const h = headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent");
  void touchSession(session.userId, ip, ua).catch((err) => {
    console.error("[session-touch] failed:", err);
  });

  const notifications = await prisma.inAppNotification.findMany({
    where: { recipientUserId: session.userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const headerContent = (
    <>
      {/* Search — takes available space, capped width, aligned to title */}
      <div className="hidden flex-1 md:block">
        <div className="max-w-md">
          <GlobalSearch />
        </div>
      </div>

      {/* Right: utility buttons (always aligned to right edge) */}
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/scan"
          className="flex h-8 items-center gap-1.5 rounded border border-border px-2.5 text-xs font-medium text-slate-300 transition hover:border-primary hover:text-white"
          title="Open scanner"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M3 4.25A2.25 2.25 0 015.25 2h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 004.5 4.25v1.5a.75.75 0 01-1.5 0v-1.5zM13.25 2a.75.75 0 000 1.5h1.5a.75.75 0 01.75.75v1.5a.75.75 0 001.5 0v-1.5A2.25 2.25 0 0014.75 2h-1.5zM3 14.25a.75.75 0 011.5 0v1.5a.75.75 0 00.75.75h1.5a.75.75 0 010 1.5h-1.5A2.25 2.25 0 013 15.75v-1.5zM15.5 14.25a.75.75 0 011.5 0v1.5A2.25 2.25 0 0114.75 18h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 00.75-.75v-1.5zM2.75 9.25a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75z" />
          </svg>
          <span className="hidden sm:inline">Scan</span>
        </Link>
        <ThemeToggle />
        <NotificationBell notifications={notifications} />
        <HelpMenu />
        <Link
          href="/profile"
          className="hidden text-right text-xs transition hover:text-white sm:block"
        >
          <div className="font-medium text-slate-100">{session.name}</div>
          <div className="text-[10px] tracking-wide text-muted-foreground">
            {/* Round-4 §pre-work-2: humanise() canonical surface.
                Was a raw .replace + uppercase; now the documented
                titlecase form ("Ops manager", "Read only") with
                acronym preservation. */}
            {formatRole(session.role)}
          </div>
        </Link>
        <SignOutButton />
      </div>
    </>
  );

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
        <div className="fixed left-0 right-0 top-0 z-[60] border-b border-amber-500/40 bg-amber-500/20 px-6 py-2 text-center text-xs font-semibold text-amber-100">
          BreakFix Triage is in READ-ONLY MODE — writes are rejected at
          the edge. Flip <code className="font-medium tracking-tight">READ_ONLY_MODE</code>{" "}
          off once the cutover window closes.
        </div>
      )}
      <AppShell
        isAdmin={isAdmin}
        isManager={isManager}
        headerContent={headerContent}
      >
        {children}
      </AppShell>
      <Suspense fallback={null}>
        <ToastHost />
      </Suspense>
      <CommandPalette />
    </div>
  );
}

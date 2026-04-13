"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string };
type NavGroup = { title?: string; items: NavItem[] };

function buildGroups(isAdmin: boolean, isManager: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    {
      items: [{ href: "/", label: "My Day" }],
    },
    {
      title: "Operations",
      items: [
        { href: "/tickets", label: "Tickets" },
        { href: "/bench", label: "Bench" },
        { href: "/scheduling", label: "Scheduling" },
      ],
    },
  ];

  const backOffice: NavItem[] = [{ href: "/quotes", label: "Quotes" }];
  if (isManager) {
    backOffice.push({ href: "/invoices", label: "Invoices" });
    backOffice.push({ href: "/imports", label: "Imports" });
  }
  backOffice.push({ href: "/duplicates", label: "Duplicates" });
  groups.push({ title: "Back Office", items: backOffice });

  groups.push({
    title: "Insights",
    items: [{ href: "/dashboards", label: "Dashboards" }],
  });

  if (isAdmin) {
    groups.push({
      title: "System",
      items: [{ href: "/admin", label: "Admin" }],
    });
  }

  return groups;
}

const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarCollapsed() {
  return useContext(SidebarContext).collapsed;
}

/**
 * App shell that wraps sidebar + main content.
 * This is a client component so collapse state is shared.
 */
export function AppShell({
  isAdmin,
  isManager,
  headerContent,
  children,
}: {
  isAdmin: boolean;
  isManager: boolean;
  headerContent: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const groups = buildGroups(isAdmin, isManager);

  // Close mobile sidebar on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {/* Top bar */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-surface-border bg-surface-muted/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-300 transition hover:bg-surface-border hover:text-white lg:hidden"
            aria-label="Toggle menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              {open ? (
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                  clipRule="evenodd"
                />
              )}
            </svg>
          </button>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden h-8 w-8 items-center justify-center rounded text-slate-400 transition hover:bg-surface-border hover:text-white lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed ? "rotate-180" : "",
              )}
            >
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <Link
            href="/"
            className="text-base font-bold tracking-tight text-slate-100"
          >
            BreakFix Triage
          </Link>
        </div>

        {/* Pass through header content (search, utility buttons) */}
        {headerContent}
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-14 z-50 flex h-[calc(100vh-3.5rem)] flex-col border-r border-surface-border bg-surface-muted transition-all duration-200",
          // Mobile: slide in/out
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible
          "lg:translate-x-0",
          collapsed ? "lg:w-14" : "lg:w-52",
        )}
      >
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-5" : ""}>
              {group.title && !collapsed && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </div>
              )}
              {collapsed && gi > 0 && (
                <div className="mx-1 mb-2 border-t border-surface-border/50" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-accent/15 font-semibold text-accent"
                            : "text-slate-300 hover:bg-surface-border/40 hover:text-white",
                          collapsed && "justify-center px-0",
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        {collapsed ? (
                          <span className="text-[10px] font-bold uppercase leading-none">
                            {item.label.slice(0, 2)}
                          </span>
                        ) : (
                          item.label
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content — offset for fixed header + sidebar */}
      <main
        id="main-content"
        className={cn(
          "flex-1 pt-14 transition-all duration-200",
          collapsed ? "lg:pl-14" : "lg:pl-52",
        )}
        tabIndex={-1}
      >
        <div className="mx-auto w-full max-w-[1600px] px-6 py-8">
          {children}
        </div>
      </main>
    </SidebarContext.Provider>
  );
}

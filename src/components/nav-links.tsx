"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Primary nav links for the header.
 *
 * Grouped by workflow area with visual separators so the bar reads
 * left-to-right in the order people actually use it: Home first,
 * then daily work (Tickets, Bench, Scheduling, Scan), then
 * back-office (Quotes, Invoices, Imports, Duplicates), then
 * analytics (Dashboards), and Admin last.
 */

const NAV_GROUPS: { links: { href: string; label: string }[] }[] = [
  {
    links: [
      { href: "/", label: "My Day" },
    ],
  },
  {
    links: [
      { href: "/tickets", label: "Tickets" },
      { href: "/bench", label: "Bench" },
      { href: "/scheduling", label: "Scheduling" },
      { href: "/scan", label: "Scan" },
    ],
  },
  {
    links: [
      { href: "/quotes", label: "Quotes" },
      { href: "/invoices", label: "Invoices" },
      { href: "/imports", label: "Imports" },
      { href: "/duplicates", label: "Duplicates" },
    ],
  },
  {
    links: [
      { href: "/dashboards", label: "Dashboards" },
    ],
  },
];

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname() ?? "";

  const groups = isAdmin
    ? [
        ...NAV_GROUPS,
        { links: [{ href: "/admin", label: "Admin" }] },
      ]
    : NAV_GROUPS;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && (
            <span className="mx-2 hidden text-surface-border sm:inline">
              |
            </span>
          )}
          <div className="flex gap-3">
            {group.links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "transition-colors whitespace-nowrap",
                    active
                      ? "text-accent font-semibold"
                      : "text-slate-300 hover:text-white",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

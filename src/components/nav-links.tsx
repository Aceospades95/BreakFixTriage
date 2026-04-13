"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Primary nav links for the header.
 *
 * Grouped by workflow area with visual separators. Invoices and
 * imports are only shown to managers/admins. Scan was moved to a
 * header button so it doesn't waste nav space.
 */

type NavLink = { href: string; label: string };

function buildGroups(isAdmin: boolean, isManager: boolean): NavLink[][] {
  const groups: NavLink[][] = [
    [{ href: "/", label: "My Day" }],
    [
      { href: "/tickets", label: "Tickets" },
      { href: "/bench", label: "Bench" },
      { href: "/scheduling", label: "Scheduling" },
    ],
  ];

  // Back-office: only managers/admins see invoices & imports
  const backOffice: NavLink[] = [{ href: "/quotes", label: "Quotes" }];
  if (isManager) {
    backOffice.push({ href: "/invoices", label: "Invoices" });
    backOffice.push({ href: "/imports", label: "Imports" });
  }
  backOffice.push({ href: "/duplicates", label: "Duplicates" });
  groups.push(backOffice);

  groups.push([{ href: "/dashboards", label: "Dashboards" }]);

  if (isAdmin) {
    groups.push([{ href: "/admin", label: "Admin" }]);
  }

  return groups;
}

export function NavLinks({
  isAdmin = false,
  isManager = false,
}: {
  isAdmin?: boolean;
  isManager?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const groups = buildGroups(isAdmin, isManager);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && (
            <span className="mx-2.5 hidden text-surface-border sm:inline">
              |
            </span>
          )}
          <div className="flex gap-3">
            {group.map((link) => {
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
                    "whitespace-nowrap transition-colors",
                    active
                      ? "font-semibold text-accent"
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

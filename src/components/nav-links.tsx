"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/tickets", label: "Tickets" },
  { href: "/imports", label: "Imports" },
  { href: "/duplicates", label: "Duplicates" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/my-day", label: "My Day" },
  { href: "/scan", label: "Scan" },
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/shift-notes", label: "Shift notes" },
  { href: "/dashboards", label: "Dashboards" },
] as const;

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname() ?? "";
  const links = [
    ...LINKS,
    ...(isAdmin
      ? ([{ href: "/admin", label: "Admin" }] as const)
      : ([] as const)),
  ];
  return (
    <nav className="flex flex-wrap gap-4 text-sm">
      {links.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "transition-colors",
              active
                ? "text-accent font-semibold"
                : "text-slate-300 hover:text-white",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

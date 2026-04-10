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
  { href: "/dashboards", label: "Dashboards" },
] as const;

export function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex gap-5 text-sm">
      {LINKS.map((link) => {
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

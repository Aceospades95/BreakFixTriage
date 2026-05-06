"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/districts", label: "Districts" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/device-models", label: "Device models" },
  { href: "/admin/parts", label: "Parts" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/statuses", label: "Statuses" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/audit", label: "Audit log" },
] as const;

export function AdminSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {ADMIN_LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded px-3 py-1.5 transition-colors",
              active
                ? "bg-primary/15 font-semibold text-primary"
                : "text-slate-300 hover:bg-muted hover:text-white",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// `emailOnly: true` marks the links an EMAIL_WRITE-only session
// (OPS_MANAGER) may open; everything else needs USERS_MANAGE.
const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  // Round-15 (B26) — failure-mode rollup; kept near the top so an
  // on-call admin sees it first.
  { href: "/admin/exceptions", label: "Exceptions" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/districts", label: "Districts" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/device-models", label: "Device models" },
  { href: "/admin/parts", label: "Parts" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/statuses", label: "Statuses" },
  { href: "/admin/templates", label: "Templates" },
  // Round-3 §A — email + holidays admin pages.
  { href: "/admin/email-rules", label: "Email rules" },
  { href: "/admin/email-templates", label: "Email templates", emailOnly: true },
  { href: "/admin/email-log", label: "Email log", emailOnly: true },
  { href: "/admin/holidays", label: "Holidays" },
  // Round-3 §L — bulk close stale (preview + commit).
  { href: "/admin/tools/bulk-close", label: "Bulk close stale" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminSidebar({
  canManageUsers = true,
}: {
  canManageUsers?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const links = canManageUsers
    ? ADMIN_LINKS
    : ADMIN_LINKS.filter((link) => "emailOnly" in link && link.emailOnly);

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
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

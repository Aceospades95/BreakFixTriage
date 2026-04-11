import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

/**
 * Admin sub-shell. Everything under /admin requires USERS_MANAGE
 * (which only ADMIN has today). We re-check on every page load so a
 * role change mid-session takes effect immediately.
 */
const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/districts", label: "Districts" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/loaners", label: "Loaners" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/audit", label: "Audit log" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <nav className="flex flex-col gap-1 text-sm">
          {ADMIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded px-3 py-1.5 text-slate-300 transition hover:bg-surface-muted hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}

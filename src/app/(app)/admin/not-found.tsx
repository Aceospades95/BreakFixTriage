import Link from "next/link";
import { PageHeader } from "@/components/page-header";

/**
 * Round-4 §G29 — admin-scoped 404.
 *
 * Lives inside the (app) group AND inside the admin route segment
 * so admin URL typos surface with the full admin chrome (sidebar
 * + topbar + admin sub-nav). Did-you-mean is the static admin
 * route table — Levenshtein-on-route-tree is filed for a follow-
 * up.
 */
const ADMIN_ROUTES = [
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
  { href: "/admin/email-rules", label: "Email rules" },
  { href: "/admin/email-templates", label: "Email templates" },
  { href: "/admin/email-log", label: "Email log" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/tools/bulk-close", label: "Bulk close stale" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
];

export default function AdminNotFound() {
  return (
    <div data-not-found="admin">
      <PageHeader
        title="Page not found"
        subtitle="That admin URL doesn't match any route. Common destinations below."
      />

      <div className="rounded border border-surface-border bg-surface-muted/40 p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
          Admin destinations
        </h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {ADMIN_ROUTES.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="text-accent hover:underline">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        If you got here from a link inside the app, that link is stale.
        Please flag the URL to the maintainer with where you came from.
      </p>
    </div>
  );
}

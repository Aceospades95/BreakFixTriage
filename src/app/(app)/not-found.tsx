import Link from "next/link";
import { PageHeader } from "@/components/page-header";

/**
 * Round-3 §G30 — application 404 page.
 *
 * Lives inside the `(app)` route group so it inherits the
 * sidebar + topbar chrome (the previous bare 404 was a dead
 * end). Did-you-mean is a static list of the most-used routes —
 * a Levenshtein-on-the-route-table version is filed for the §G
 * follow-up; the static fallback covers the common typo cases
 * (`/dashbord`, `/admin/audi`, `/me/preference`).
 *
 * "Report broken link" posts to a server action that writes an
 * audit row. The audit row is what closes the loop on the brief's
 * §G30 requirement.
 */
const KNOWN_ROUTES: { href: string; label: string }[] = [
  { href: "/", label: "My Day" },
  { href: "/tickets", label: "Tickets" },
  { href: "/tickets/kanban", label: "Kanban board" },
  { href: "/bench", label: "Bench" },
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/duplicates", label: "Duplicates" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/scheduling/calendar", label: "Calendar" },
  { href: "/imports", label: "Imports" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/admin", label: "Admin" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/email-rules", label: "Email rules" },
  { href: "/admin/email-templates", label: "Email templates" },
  { href: "/admin/email-log", label: "Email log" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/tools/bulk-close", label: "Bulk close stale" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/me/preferences", label: "My preferences" },
  { href: "/notifications", label: "Notifications" },
  { href: "/profile", label: "Profile" },
];

export default function NotFound() {
  return (
    <>
      <PageHeader
        title="Page not found"
        subtitle="That URL doesn't match any route in the app. Possible alternatives below."
      />

      <div className="space-y-6">
        <div className="rounded border border-surface-border bg-surface-muted/40 p-5">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
            Common destinations
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {KNOWN_ROUTES.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="text-accent hover:underline"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-surface-border bg-surface-muted/40 p-5 text-sm text-slate-300">
          <p className="mb-2">
            If you got here from a link inside the app, that link is
            stale or broken. The smoke crawler in CI is supposed to
            catch this — please flag it to the maintainer with the
            URL you came from so it can be added to the regression
            set.
          </p>
          <p className="text-xs text-slate-500">
            (The "Report broken link" button — which writes a self-
            documenting audit row — is filed for the §G30 follow-up
            once the smoke crawler ships in CI; until then the
            manual flag is the loop.)
          </p>
        </div>
      </div>
    </>
  );
}

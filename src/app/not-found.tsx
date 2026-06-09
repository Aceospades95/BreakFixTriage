import Link from "next/link";

/**
 * Round-14 — root-level 404.
 *
 * The chromed (app)/not-found.tsx only renders for `notFound()`
 * calls thrown INSIDE the (app) segment. URLs that match no route
 * at all (e.g. /admin/foobar-nonsense) resolve at the root, which
 * previously fell through to Next's bare default 404 — exactly the
 * dead end Round-7 §1B set out to remove.
 *
 * This page is intentionally standalone (no app sidebar/topbar):
 * it must render for anonymous visitors too (bad portal links),
 * where the (app) chrome would bounce them to /signin. It keeps
 * the same data-testid and "Common destinations" affordance the
 * not-found regression spec pins.
 */
const KNOWN_ROUTES: { href: string; label: string }[] = [
  { href: "/", label: "My Day" },
  { href: "/tickets", label: "Tickets" },
  { href: "/tickets/kanban", label: "Kanban board" },
  { href: "/bench", label: "Bench" },
  { href: "/quotes", label: "Quotes" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/imports", label: "Imports" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/admin", label: "Admin" },
];

export default function RootNotFound() {
  return (
    <main
      data-testid="chromed-not-found"
      data-not-found="root"
      className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12"
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          BreakFix Triage
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          That URL doesn&apos;t match any route in the app. Possible
          alternatives below.
        </p>
      </div>

      <div className="rounded border border-surface-border bg-surface-muted/40 p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
          Common destinations
        </h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {KNOWN_ROUTES.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="text-accent hover:underline">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

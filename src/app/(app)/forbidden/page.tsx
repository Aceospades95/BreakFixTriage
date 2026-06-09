import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import { formatRole } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Round-14 (graduates backlog B8) — chromed access-denied page.
 *
 * `requireRole` redirects here when the session is authenticated but
 * lacks a permission. Lives inside the `(app)` route group so it
 * inherits the sidebar + topbar chrome — the operator keeps their
 * bearings instead of hitting an error boundary.
 *
 * The missing permission arrives via `?perm=` and renders inside a
 * `<code>` chip per docs/ui-conventions.md (raw permission tokens
 * never appear as prose).
 */
export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams?: { perm?: string };
}) {
  const session = await requireSession();
  const perm = searchParams?.perm ?? null;

  return (
    <div data-testid="forbidden-page">
      <PageHeader
        title="Access denied"
        subtitle="Your role doesn't have permission to view this page or perform that action."
      />

      <div className="space-y-6">
        <div className="rounded border border-surface-border bg-surface-muted/40 p-5 text-sm text-slate-300">
          <p>
            You are signed in as{" "}
            <span className="font-semibold text-slate-100">
              {session.name}
            </span>{" "}
            with the{" "}
            <span className="font-semibold text-slate-100">
              {formatRole(session.role)}
            </span>{" "}
            role.
            {perm && (
              <>
                {" "}
                The page you tried to reach requires the{" "}
                <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-slate-200">
                  {perm}
                </code>{" "}
                permission.
              </>
            )}
          </p>
          <p className="mt-3">
            If you think this is wrong, ask an administrator — per-role
            permissions are editable on the admin permissions page.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded border border-surface-border px-3 py-1.5 text-sm font-semibold text-slate-200 hover:border-accent"
          >
            Go home
          </Link>
          <Link
            href="/tickets"
            className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:border-accent"
          >
            Open tickets
          </Link>
        </div>
      </div>
    </div>
  );
}

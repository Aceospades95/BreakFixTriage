import Link from "next/link";
import { RouteStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RouteStatusPill } from "@/components/route-status-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_FILTERS: Array<{ key: string; statuses: RouteStatus[] }> = [
  { key: "active", statuses: ["DRAFT", "PLANNED", "IN_PROGRESS"] },
  { key: "completed", statuses: ["COMPLETED"] },
  { key: "cancelled", statuses: ["CANCELLED"] },
  { key: "all", statuses: [] },
];

/**
 * Round-14 — real route index, graduating the Round-6 §1C
 * notFound() placeholder. docs/sitemap.md has documented
 * `/scheduling/routes` as a view-only index for any role since
 * Round 6; this page finally honors that contract.
 *
 * Filter pills (active / completed / cancelled / all) + a paged
 * table of routes with date, driver, stop count, and status.
 */
export default async function RoutesIndexPage({
  searchParams,
}: {
  searchParams?: { filter?: string; page?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canBuild = can(session.role, PERMISSIONS.ROUTES_BUILD);

  const filter =
    STATUS_FILTERS.find((f) => f.key === searchParams?.filter) ??
    STATUS_FILTERS[0]!;
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
  const where =
    filter.statuses.length > 0 ? { status: { in: filter.statuses } } : {};

  const [routes, total, countsRaw] = await Promise.all([
    prisma.route.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        assignee: { select: { name: true } },
        _count: { select: { stops: true } },
      },
    }),
    prisma.route.count({ where }),
    prisma.route.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countByStatus = new Map(
    countsRaw.map((c) => [c.status, c._count._all]),
  );
  const countFor = (f: (typeof STATUS_FILTERS)[number]) =>
    f.statuses.length === 0
      ? countsRaw.reduce((a, c) => a + c._count._all, 0)
      : f.statuses.reduce((a, s) => a + (countByStatus.get(s) ?? 0), 0);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Routes"
        subtitle="Every route, newest first. Open one for the stop list and print sheet."
        actions={
          <div className="flex gap-2">
            {canBuild && (
              <Link
                href="/scheduling/routes/new"
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold transition hover:bg-accent-strong"
              >
                Build route
              </Link>
            )}
            <Link
              href="/scheduling"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Scheduling
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.key === filter.key;
          return (
            <Link
              key={f.key}
              href={`/scheduling/routes?filter=${f.key}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-surface-border text-slate-300 hover:border-accent"
              }`}
            >
              {humanise(f.key.toUpperCase())}
              <span className="rounded-full bg-surface-border px-1.5 py-0.5 text-[10px] tabular-nums">
                {countFor(f)}
              </span>
            </Link>
          );
        })}
      </div>

      {routes.length === 0 ? (
        <EmptyState
          headline="No routes here"
          body={
            canBuild
              ? "Nothing matches this filter. Build a route from unscheduled jobs to get started."
              : "Nothing matches this filter."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Driver</th>
                <th className="px-4 py-2.5">Stops</th>
                <th className="px-4 py-2.5">Vehicle</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-surface-border transition hover:bg-surface-muted/40"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/scheduling/routes/${r.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.date.toISOString().slice(0, 10)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r.assignee.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {r._count.stops}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {r.vehicleRef ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <RouteStatusPill status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {pageCount} · {total} route{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/scheduling/routes?filter=${filter.key}&page=${page - 1}`}
                className="rounded border border-surface-border px-3 py-1.5 transition hover:border-accent"
              >
                ← Newer
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/scheduling/routes?filter=${filter.key}&page=${page + 1}`}
                className="rounded border border-surface-border px-3 py-1.5 transition hover:border-accent"
              >
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { LocalTime } from "@/components/local-time";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { ticketWhereForSession } from "@/lib/data/forSession";

export const dynamic = "force-dynamic";

/**
 * Round-22 (demo feedback) — "after you're done closing a ticket, does
 * it show up there?" The bench only shows active work; this is the
 * history behind it: every closure with who closed it and how long the
 * ticket took, plus the month's closed-count leaderboard ("Jamie, you
 * closed the most tickets this month").
 *
 * Attribution uses the CLOSED transition's actor from the event
 * timeline — the person who actually closed it — not the assignee,
 * which bulk-reassignment can rewrite after the fact.
 */

const WINDOW_OPTIONS = [30, 90] as const;

export default async function BenchHistoryPage({
  searchParams,
}: {
  searchParams?: { days?: string; who?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const scope = ticketWhereForSession(session);

  const days = searchParams?.days === "90" ? 90 : 30;
  const whoFilter = searchParams?.who || undefined;

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [closures, monthGroups] = await Promise.all([
    prisma.ticketEvent.findMany({
      where: {
        toState: "CLOSED",
        createdAt: { gte: from },
        ...(whoFilter ? { actorUserId: whoFilter } : {}),
        ticket: scope,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        actor: { select: { id: true, name: true } },
        ticket: {
          select: {
            incidentNumber: true,
            shortDescription: true,
            reportedAt: true,
            school: { select: { name: true } },
            assignee: { select: { name: true } },
          },
        },
      },
    }),
    prisma.ticketEvent.groupBy({
      by: ["actorUserId"],
      where: {
        toState: "CLOSED",
        createdAt: { gte: monthStart },
        actorUserId: { not: null },
        ticket: scope,
      },
      _count: { _all: true },
    }),
  ]);

  const leaderIds = monthGroups
    .map((g) => g.actorUserId)
    .filter((id): id is string => id != null);
  const leaderUsers =
    leaderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: leaderIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(leaderUsers.map((u) => [u.id, u.name]));
  const leaderboard = monthGroups
    .map((g) => ({
      userId: g.actorUserId!,
      name: nameById.get(g.actorUserId!) ?? "Unknown",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <PageHeader
        title="Bench history"
        subtitle={`${closures.length} closure${closures.length === 1 ? "" : "s"} in the last ${days} days`}
        actions={
          <div className="flex items-center gap-2">
            {WINDOW_OPTIONS.map((d) => (
              <Link
                key={d}
                href={`/bench/history?days=${d}${whoFilter ? `&who=${whoFilter}` : ""}`}
                className={`rounded border px-3 py-1.5 text-sm transition ${
                  days === d
                    ? "border-accent text-accent"
                    : "border-surface-border hover:border-accent"
                }`}
              >
                {d} days
              </Link>
            ))}
            <Link
              href="/bench"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              ← Bench
            </Link>
          </div>
        }
      />

      {/* ── Monthly leaderboard ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Closed this month · {monthLabel}
        </h2>
        {leaderboard.length === 0 ? (
          <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
            No tickets closed yet this month.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {leaderboard.map((row, i) => (
              <Link
                key={row.userId}
                href={`/bench/history?days=${days}&who=${row.userId}`}
                data-testid="leaderboard-row"
                className={`rounded-lg border p-3 transition hover:border-accent ${
                  i === 0
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-surface-border bg-surface-muted/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {i === 0 && <span title="Most closures this month">★ </span>}
                      {row.name}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      closed this month
                    </div>
                  </div>
                  <span className="text-2xl font-semibold tabular-nums">
                    {row.count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {whoFilter && (
          <p className="mt-2 text-xs text-slate-400">
            Log filtered to one person.{" "}
            <Link
              href={`/bench/history?days=${days}`}
              className="text-accent hover:underline"
            >
              Show everyone
            </Link>
          </p>
        )}
      </section>

      {/* ── Closure log ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Closure log
        </h2>
        {closures.length === 0 ? (
          <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
            Nothing closed in this window.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">School</th>
                  <th className="px-3 py-2 font-medium">Closed by</th>
                  <th className="px-3 py-2 font-medium">Closed</th>
                  <th className="px-3 py-2 font-medium">Turnaround</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {closures.map((ev) => {
                  const turnaroundDays =
                    (ev.createdAt.getTime() - ev.ticket.reportedAt.getTime()) /
                    (24 * 60 * 60 * 1000);
                  return (
                    <tr
                      key={ev.id}
                      data-testid="closure-row"
                      className="transition hover:bg-surface-muted/40"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/tickets/${ev.ticket.incidentNumber}`}
                          className="font-medium tracking-tight text-accent hover:underline"
                        >
                          {ev.ticket.incidentNumber}
                        </Link>
                        <div className="max-w-64 truncate text-xs text-slate-400">
                          {ev.ticket.shortDescription}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {ev.ticket.school.name}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {ev.actor?.name ?? "system"}
                        {ev.ticket.assignee &&
                          ev.ticket.assignee.name !== ev.actor?.name && (
                            <div className="text-[10px] text-slate-500">
                              assigned: {ev.ticket.assignee.name}
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        <LocalTime date={ev.createdAt} mode="datetime" />
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-slate-300">
                        {turnaroundDays.toFixed(1)}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

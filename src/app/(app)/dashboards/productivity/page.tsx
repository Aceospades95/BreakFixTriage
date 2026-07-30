import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { productivityReport } from "@/lib/reports/productivity";
import { prisma } from "@/lib/db/prisma";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { ticketWhereForBorough } from "@/lib/geo/boroughs";
import { boroughOptions, normalizeBorough } from "@/lib/geo/borough-options";
import { BoroughFilter } from "@/components/borough-filter";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProductivityPage({
  searchParams,
}: {
  searchParams?: { days?: string; borough?: string };
}) {
  const session = await requireRole(PERMISSIONS.REPORTS_READ);
  // Five-borough expansion — scope the ticket-derived columns.
  const boroughs = await boroughOptions(prisma, session);
  const borough = normalizeBorough(searchParams?.borough, boroughs);
  const scope = andTicketWhere(
    ticketWhereForSession(session),
    ticketWhereForBorough(borough),
  );

  const days = Math.max(
    1,
    Math.min(365, parseInt(searchParams?.days ?? "30", 10) || 30),
  );
  const rows = await productivityReport(days, prisma, new Date(), scope);

  const totalClosed = rows.reduce((a, r) => a + r.closedInWindow, 0);
  const totalMinutes = rows.reduce((a, r) => a + r.totalMinutesLogged, 0);
  // The denominator has to be people who actually did something in
  // the window, not the whole active roster. productivityReport emits
  // a zero row per active user by design, so dividing by rows.length
  // meant filtering to one borough divided that borough's closures by
  // the entire citywide headcount and the average collapsed toward
  // zero — the number moved for a reason that had nothing to do with
  // productivity.
  const activeRows = rows.filter(
    (r) =>
      r.closedInWindow > 0 ||
      r.openAssigned > 0 ||
      r.totalMinutesLogged > 0 ||
      r.stopsCompleted > 0 ||
      r.routesRun > 0,
  );

  return (
    <>
      <PageHeader
        title="Productivity"
        subtitle={`Per-assignee ticket throughput and time logged over the last ${days} day${days === 1 ? "" : "s"}${borough ? `, ${borough} tickets only` : ""}.`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <BoroughFilter
              boroughs={boroughs}
              selected={borough}
              carry={{ days }}
            />
            <div className="flex items-center gap-2 pb-1 text-xs">
              {[7, 14, 30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/dashboards/productivity?${new URLSearchParams(
                    borough
                      ? { days: String(d), borough }
                      : { days: String(d) },
                  ).toString()}`}
                  className={`rounded border px-2 py-1 transition ${
                    d === days
                      ? "border-accent bg-accent/10 text-white"
                      : "border-surface-border text-slate-400 hover:border-accent"
                  }`}
                >
                  {d}d
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Tickets closed"
          value={totalClosed.toString()}
          hint={`across ${activeRows.length} active of ${rows.length} assignees`}
        />
        <Kpi
          label="Hours logged"
          value={(totalMinutes / 60).toFixed(1)}
          hint="from time entries"
        />
        <Kpi
          label="Avg per assignee"
          value={
            activeRows.length > 0
              ? (totalClosed / activeRows.length).toFixed(1)
              : "—"
          }
          hint="tickets closed, per active assignee"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Closed</th>
              <th className="px-3 py-2 font-medium">Avg turnaround</th>
              <th className="px-3 py-2 font-medium">Open</th>
              <th className="px-3 py-2 font-medium">Hours logged</th>
              <th className="px-3 py-2 font-medium">Routes</th>
              <th className="px-3 py-2 font-medium">Stops done</th>
              <th className="px-3 py-2 font-medium">Devices verified</th>
              <th className="px-3 py-2 font-medium">Fail / partial</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((r) => (
              <tr
                key={r.userId}
                className="transition hover:bg-surface-muted/40"
              >
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {/* Round-3 §J27 + §G29: friendly role label, no
                      ALL_CAPS_UNDERSCORE. */}
                  {humanise(r.role)}
                </td>
                <td className="px-3 py-2 font-medium tracking-tight">{r.closedInWindow}</td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs">
                  {r.avgTurnaroundDays != null
                    ? `${r.avgTurnaroundDays}d`
                    : "—"}
                </td>
                <td className="px-3 py-2 font-medium tracking-tight">{r.openAssigned}</td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs">
                  {(r.totalMinutesLogged / 60).toFixed(1)}h
                </td>
                <td className="px-3 py-2 font-medium tracking-tight">{r.routesRun}</td>
                <td className="px-3 py-2 font-medium tracking-tight">{r.stopsCompleted}</td>
                <td className="px-3 py-2 font-medium tracking-tight">{r.devicesVerified}</td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs">
                  {r.stopsFailed + r.stopsPartial === 0 ? (
                    "—"
                  ) : (
                    <span className="text-amber-300">
                      {r.stopsFailed} / {r.stopsPartial}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No assignees on record.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Closed count is measured at ticket closure time. Turnaround is
        the elapsed time from when a ticket was reported to when it was
        closed. Time logged sums every time entry that finished in the
        window. Roles that don&apos;t track time (drivers, dispatch) show 0h
        — that&apos;s expected.
        {borough && (
          <>
            {" "}
            The borough filter applies to the ticket columns (closed,
            turnaround, open). Routes, stops and devices verified are counted
            per person across every borough they worked, because a single
            route can cross a borough line.
          </>
        )}
      </p>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

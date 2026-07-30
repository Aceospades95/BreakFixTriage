import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { ticketWhereForSession } from "@/lib/data/forSession";
import { districtIdsFor } from "@/lib/geo/borough-options";
import {
  boroughRollup,
  IMPORTED_BACKLOG_DAYS,
  UNASSIGNED_BOROUGH,
  type BoroughReportRow,
} from "@/lib/reports/boroughs";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [7, 30, 90] as const;

/**
 * Per-borough comparison report.
 *
 * The borough filters on /tickets, /scheduling and the other
 * dashboards answer "how is this borough doing". This page answers
 * the question a citywide operation actually asks in a status
 * meeting: how do the five compare, and which one needs attention
 * this week. One row per borough, every cell a link into the
 * equivalent filtered list so a number is never a dead end.
 *
 * Every metric comes from the same helper the rest of the app uses
 * (see src/lib/reports/boroughs.ts) so nothing here can disagree with
 * /dashboards or /admin/exceptions.
 */
export default async function BoroughReportPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const session = await requireRole(PERMISSIONS.REPORTS_READ);
  const scope = ticketWhereForSession(session);

  const daysParsed = parseInt(searchParams?.days ?? "", 10);
  const windowDays = (WINDOW_OPTIONS as readonly number[]).includes(daysParsed)
    ? daysParsed
    : 30;

  const report = await boroughRollup(prisma, {
    windowDays,
    scope,
    districtIds: districtIdsFor(session),
  });

  const exportQs = new URLSearchParams({ days: String(windowDays) }).toString();

  return (
    <>
      <PageHeader
        title="By borough"
        subtitle={`Every borough side by side. Closures and turnaround cover the last ${windowDays} days; open, aging, breached and backlog are current.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {WINDOW_OPTIONS.map((d) => (
              <Link
                key={d}
                href={`/dashboards/boroughs?days=${d}`}
                aria-current={d === windowDays ? "true" : undefined}
                className={`rounded border px-3 py-1.5 text-sm transition ${
                  d === windowDays
                    ? "border-accent text-accent"
                    : "border-surface-border hover:border-accent"
                }`}
              >
                {d} days
              </Link>
            ))}
            <a
              href={`/api/exports/boroughs?${exportQs}`}
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              ⬇ Export CSV
            </a>
          </div>
        }
      />

      {report.rows.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
          No boroughs to compare yet. Set the Borough field on your districts
          in{" "}
          <Link href="/admin/districts" className="text-accent hover:underline">
            Admin → Districts
          </Link>{" "}
          — it is filled in automatically from NYC DBN school codes when
          schools are imported.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Borough</th>
                <th className="px-3 py-2 font-medium" title="Districts / schools in this borough">
                  Districts
                </th>
                <th className="px-3 py-2 font-medium">Schools</th>
                <th className="px-3 py-2 font-medium">Open</th>
                <th
                  className="px-3 py-2 font-medium"
                  title={`Open more than ${report.agingThresholdDays} days`}
                >
                  Aging
                </th>
                <th
                  className="px-3 py-2 font-medium"
                  title="Days in the current state have reached that state's SLA threshold"
                >
                  SLA breached
                </th>
                <th
                  className="px-3 py-2 font-medium"
                  title="Imported but never triaged, 30+ days"
                >
                  No triage 30d+
                </th>
                <th className="px-3 py-2 font-medium">
                  Closed ({windowDays}d)
                </th>
                <th
                  className="px-3 py-2 font-medium"
                  title="Mean days from reported to closed, for tickets closed in the window"
                >
                  Avg turnaround
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {report.rows.map((r) => (
                <BoroughRow
                  key={r.borough}
                  row={r}
                  windowDays={windowDays}
                  windowStart={report.windowStart}
                  agingThresholdDays={report.agingThresholdDays}
                />
              ))}
            </tbody>
            <tfoot className="border-t-2 border-surface-border bg-surface-muted/60 font-semibold">
              <tr>
                <td className="px-3 py-2">All boroughs</td>
                <td className="px-3 py-2 tabular-nums">{report.total.districts}</td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.schools.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.openTickets.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.aging.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.breached.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.importedBacklog.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.closedInWindow.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.total.avgTurnaroundDays ?? "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Every number links to the list behind it. Totals are summed from the
        rows above, and districts with no borough set are shown as
        &ldquo;{UNASSIGNED_BOROUGH}&rdquo; so the rows always add up to the
        citywide figure.
      </p>
    </>
  );
}

function BoroughRow({
  row,
  windowDays,
  windowStart,
  agingThresholdDays,
}: {
  row: BoroughReportRow;
  windowDays: number;
  windowStart: Date;
  agingThresholdDays: number;
}) {
  const unassigned = row.borough === UNASSIGNED_BOROUGH;
  // Drill-through only works for a real borough — "Unassigned" is not
  // a value any filter can select.
  const link = (params: Record<string, string>) => {
    if (unassigned) return null;
    const sp = new URLSearchParams({ borough: row.borough, ...params });
    return `/tickets?${sp.toString()}`;
  };
  return (
    <tr data-testid="borough-row">
      <td className="px-3 py-2">
        {unassigned ? (
          <span className="text-slate-400" title="Districts with no Borough set">
            {row.borough}
          </span>
        ) : (
          <span className="font-medium">{row.borough}</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-400">{row.districts}</td>
      <td className="px-3 py-2 tabular-nums text-slate-400">
        {row.schools.toLocaleString()}
      </td>
      <Metric value={row.openTickets} href={link({ state: "open" })} />
      <Metric
        value={row.aging}
        href={link({ state: "open", ageDays: `gte:${agingThresholdDays}` })}
        warn
      />
      <Metric
        value={row.breached}
        href={link({ state: "open", slaHealth: "breached" })}
        warn
      />
      <Metric
        value={row.importedBacklog}
        // Threshold derived from the shared constant, not typed again:
        // the list behind this cell must apply the same 30 days the
        // metric does, or it shows every IMPORTED ticket instead of
        // the stalled subset.
        href={link({
          state: "IMPORTED",
          stateAgeDays: `gte:${IMPORTED_BACKLOG_DAYS}`,
        })}
        warn
      />
      <Metric
        value={row.closedInWindow}
        // Bounded to the same window the number counts — without
        // this the cell reads ~400 and the list reads every closure
        // in the system's history. The full instant, not a date:
        // truncating to midnight widens the list by up to a day of
        // extra closures, which is a smaller lie but still a lie.
        href={link({
          state: "CLOSED",
          closedSince: windowStart.toISOString(),
        })}
      />
      <td className="px-3 py-2 tabular-nums text-slate-300">
        {row.avgTurnaroundDays == null ? "—" : `${row.avgTurnaroundDays}d`}
      </td>
      <td className="hidden" aria-hidden="true">
        {windowDays}
      </td>
    </tr>
  );
}

function Metric({
  value,
  href,
  warn = false,
}: {
  value: number;
  href: string | null;
  warn?: boolean;
}) {
  const tone = warn && value > 0 ? "text-amber-200" : "text-slate-200";
  return (
    <td className="px-3 py-2 tabular-nums">
      {href && value > 0 ? (
        <Link href={href} className={`${tone} hover:underline`}>
          {value.toLocaleString()}
        </Link>
      ) : (
        <span className={value === 0 ? "text-slate-500" : tone}>
          {value.toLocaleString()}
        </span>
      )}
    </td>
  );
}

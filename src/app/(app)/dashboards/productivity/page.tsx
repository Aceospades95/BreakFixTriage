import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { productivityReport } from "@/lib/reports/productivity";

export const dynamic = "force-dynamic";

export default async function ProductivityPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  await requireRole(PERMISSIONS.REPORTS_READ);

  const days = Math.max(
    1,
    Math.min(365, parseInt(searchParams?.days ?? "30", 10) || 30),
  );
  const rows = await productivityReport(days);

  const totalClosed = rows.reduce((a, r) => a + r.closedInWindow, 0);
  const totalMinutes = rows.reduce((a, r) => a + r.totalMinutesLogged, 0);

  return (
    <>
      <PageHeader
        title="Productivity"
        subtitle={`Per-assignee ticket throughput and time logged over the last ${days} day${days === 1 ? "" : "s"}.`}
        actions={
          <div className="flex items-center gap-2 text-xs">
            {[7, 14, 30, 60, 90].map((d) => (
              <Link
                key={d}
                href={`/dashboards/productivity?days=${d}`}
                className={`rounded border px-2 py-1 transition ${
                  d === days
                    ? "border-accent bg-accent/10 text-white"
                    : "border-surface-border text-slate-400 hover:border-accent"
                }`}
              >
                {d}d
              </Link>
            ))}
            <Link
              href="/dashboards"
              className="ml-2 text-xs text-slate-400 hover:text-white"
            >
              ← Overview
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Tickets closed"
          value={totalClosed.toString()}
          hint={`across ${rows.length} assignees`}
        />
        <Kpi
          label="Hours logged"
          value={(totalMinutes / 60).toFixed(1)}
          hint="from time entries"
        />
        <Kpi
          label="Avg per assignee"
          value={
            rows.length > 0 ? (totalClosed / rows.length).toFixed(1) : "—"
          }
          hint="tickets closed"
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
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((r) => (
              <tr
                key={r.userId}
                className="transition hover:bg-surface-muted/40"
              >
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {r.role}
                </td>
                <td className="px-3 py-2 font-mono">{r.closedInWindow}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.avgTurnaroundDays != null
                    ? `${r.avgTurnaroundDays}d`
                    : "—"}
                </td>
                <td className="px-3 py-2 font-mono">{r.openAssigned}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {(r.totalMinutesLogged / 60).toFixed(1)}h
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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
        reportedAt → closedAt. Time logged is the sum of every{" "}
        <span className="font-mono">TimeEntry</span> that finished in the
        window. Readers who haven't logged any time yet show 0h — this is
        expected for roles that don't track time (drivers, dispatch).
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
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

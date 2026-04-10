import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  agingTickets,
  closedTicketsByMonth,
  duplicateQueueCount,
  invoiceQueueCount,
  openTicketsByState,
} from "@/lib/reports/dashboards";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  await requireRole(PERMISSIONS.REPORTS_READ);

  const [byState, closedByMonth, dupes, invoices, aging] = await Promise.all([
    openTicketsByState(),
    closedTicketsByMonth(),
    duplicateQueueCount(),
    invoiceQueueCount(),
    agingTickets(),
  ]);

  const openTotal = byState.reduce((acc, r) => acc + r.count, 0);
  const maxByState = byState[0]?.count ?? 0;

  return (
    <>
      <PageHeader title="Dashboards" subtitle="Operational health snapshot" />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open tickets" value={openTotal} href="/tickets" />
        <Kpi
          label="Duplicate queue"
          value={dupes}
          href="/duplicates"
          tone={dupes > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Invoice required"
          value={invoices}
          href="/tickets?state=INVOICE_REQUIRED"
        />
        <Kpi
          label="Aging > 30d"
          value={aging.length}
          href="/tickets"
          tone={aging.length > 0 ? "warn" : undefined}
        />
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-surface-border bg-surface-muted/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Open tickets by state
          </h2>
          {byState.length === 0 ? (
            <p className="text-sm text-slate-400">No open tickets.</p>
          ) : (
            <ul className="space-y-1">
              {byState.map((row) => (
                <li
                  key={row.state}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className="w-40">
                    <StatePill state={row.state} />
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded bg-surface-border">
                      <div
                        className="h-2 rounded bg-accent"
                        style={{
                          width: `${maxByState === 0 ? 0 : Math.round((row.count / maxByState) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-10 text-right font-mono text-xs text-slate-300">
                    {row.count}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-muted/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Closed tickets (last 12 months)
          </h2>
          {closedByMonth.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nothing has been closed in the last year.
            </p>
          ) : (
            <MonthBars rows={closedByMonth} />
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Aging tickets (&gt; 30 days, open)
        </h2>
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Incident</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">School</th>
                <th className="px-3 py-2 font-medium">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {aging.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {t.incidentNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatePill state={t.state} />
                  </td>
                  <td className="px-3 py-2">{t.school.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {t.reportedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
              {aging.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    Nothing has been open for more than 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone?: "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/60 bg-amber-500/10"
      : "border-surface-border bg-surface-muted";
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition hover:border-accent ${toneClass}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </Link>
  );
}

function MonthBars({
  rows,
}: {
  rows: { month: Date; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex items-end gap-2">
      {rows.map((r) => (
        <div key={r.month.toISOString()} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded bg-accent"
            style={{
              height: `${Math.max(4, Math.round((r.count / max) * 100))}px`,
            }}
            title={`${r.count} closed`}
          />
          <div className="text-[10px] text-slate-500">
            {r.month.toISOString().slice(0, 7)}
          </div>
        </div>
      ))}
    </div>
  );
}

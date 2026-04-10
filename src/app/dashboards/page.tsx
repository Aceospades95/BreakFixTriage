import Link from "next/link";
import {
  agingTickets,
  duplicateQueueCount,
  invoiceQueueCount,
  openTicketsByState,
} from "@/lib/reports/dashboards";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const [byState, dupes, invoices, aging] = await Promise.all([
    openTicketsByState(),
    duplicateQueueCount(),
    invoiceQueueCount(),
    agingTickets(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboards</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Home
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Duplicate queue" value={dupes} />
        <KpiCard label="Invoice-required" value={invoices} />
        <KpiCard
          label="Open tickets (total)"
          value={byState.reduce((acc, r) => acc + r.count, 0)}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Open tickets by state</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {byState.map((row) => (
            <div
              key={row.state}
              className="flex items-center justify-between rounded border border-surface-border bg-surface-muted px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-slate-400">
                {row.state}
              </span>
              <span className="font-semibold">{row.count}</span>
            </div>
          ))}
          {byState.length === 0 && (
            <p className="text-sm text-slate-400">No open tickets yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Aging tickets (&gt; 30 days)</h2>
        <ul className="mt-3 divide-y divide-surface-border rounded border border-surface-border">
          {aging.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="font-mono">{t.incidentNumber}</span>
              <span className="text-slate-400">{t.school.name}</span>
              <span className="font-mono text-xs">{t.state}</span>
            </li>
          ))}
          {aging.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-slate-400">
              Nothing aging out right now.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  );
}

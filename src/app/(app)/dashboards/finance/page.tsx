import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { ticketWhereForBorough } from "@/lib/geo/boroughs";
import { boroughOptions, normalizeBorough } from "@/lib/geo/borough-options";
import { BoroughFilter } from "@/components/borough-filter";

export const dynamic = "force-dynamic";

/**
 * Financial dashboard.
 *
 * Aggregates spend, PO activity, and parts cost for the rolling
 * last 12 months. The numbers come from PurchaseOrder rows (for the
 * billable repairs) and PartMovement rows (for internal parts
 * cost). Both sources go through existing Prisma queries — no new
 * aggregate table, so it stays honest as records change.
 */
export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams?: { borough?: string };
}) {
  const session = await requireRole(PERMISSIONS.REPORTS_READ);
  // ADR 0014 — district-scoped roles see their districts' money only.
  const boroughs = await boroughOptions(prisma, session);
  const borough = normalizeBorough(searchParams?.borough, boroughs);
  const ticketScope = andTicketWhere(
    ticketWhereForSession(session),
    ticketWhereForBorough(borough),
  );
  const poScope = { quote: { ticket: ticketScope } };

  const now = new Date();
  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );

  const [
    pos,
    pendingInvoices,
    recentPos,
    outstandingPoTotal,
    parts,
    partMovements,
  ] = await Promise.all([
    // Uncapped over the 12-month window — the money totals below are
    // reduced from this set, and a `take` cap would silently
    // understate them once volume grows. The slim select keeps the
    // row cost trivial.
    prisma.purchaseOrder.findMany({
      where: { ...poScope, issuedAt: { gte: twelveMonthsAgo } },
      select: {
        amountCents: true,
        invoicedAt: true,
        issuedAt: true,
        quote: {
          select: {
            ticket: {
              select: {
                school: {
                  select: {
                    district: {
                      select: { id: true, name: true, region: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.ticket.count({
      where: andTicketWhere(ticketScope, { state: "INVOICE_REQUIRED" }),
    }),
    prisma.purchaseOrder.findMany({
      where: { ...poScope, invoicedAt: null },
      include: {
        quote: {
          include: { ticket: { select: { incidentNumber: true, id: true } } },
        },
      },
      orderBy: { issuedAt: "asc" },
      take: 50,
    }),
    // True count behind the take:50 list below — presenting the cap
    // as the total understated outstanding money, and per-borough it
    // would understate it in five places at once.
    prisma.purchaseOrder.count({ where: { ...poScope, invoicedAt: null } }),
    prisma.part.findMany({
      where: { active: true },
      select: { id: true, onHand: true, costCents: true },
    }),
    // Consumed parts carry a ticketId, so this follows the same scope
    // as the money above. Unscoped it reported citywide parts spend to
    // a district user. Movements with no ticket (stock adjustments)
    // drop out of a scoped view — there is nothing to attribute them
    // to, and guessing would be worse than the footnote below.
    prisma.partMovement.findMany({
      where: {
        kind: "CONSUMED",
        createdAt: { gte: twelveMonthsAgo },
        ...(Object.keys(ticketScope).length > 0
          ? { ticket: ticketScope }
          : {}),
      },
      include: {
        part: { select: { costCents: true, name: true } },
      },
    }),
  ]);

  // Totals
  const totalIssuedCents = pos.reduce((a, p) => a + p.amountCents, 0);
  const invoicedCents = pos
    .filter((p) => p.invoicedAt != null)
    .reduce((a, p) => a + p.amountCents, 0);
  const outstandingCents = totalIssuedCents - invoicedCents;

  // Spend by district (last 12 months).
  const byDistrict = new Map<
    string,
    { name: string; region: string | null; amountCents: number; poCount: number }
  >();
  for (const p of pos) {
    const d = p.quote.ticket.school.district;
    const bucket = byDistrict.get(d.id) ?? {
      name: d.name,
      region: d.region,
      amountCents: 0,
      poCount: 0,
    };
    bucket.amountCents += p.amountCents;
    bucket.poCount += 1;
    byDistrict.set(d.id, bucket);
  }
  const districtRows = Array.from(byDistrict.entries())
    .sort((a, b) => b[1].amountCents - a[1].amountCents);

  // Spend by month (PO issuedAt).
  const byMonth = new Map<string, number>();
  for (const p of pos) {
    const key = `${p.issuedAt.getUTCFullYear()}-${String(p.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + p.amountCents);
  }
  const monthRows = Array.from(byMonth.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const monthMax = Math.max(1, ...monthRows.map(([, v]) => v));

  // Parts inventory value and consumed value.
  const inventoryValueCents = parts.reduce(
    (a, p) => a + p.onHand * (p.costCents ?? 0),
    0,
  );
  const partsConsumedValueCents = partMovements.reduce((a, m) => {
    const unit = m.part.costCents ?? 0;
    return a + Math.abs(m.quantity) * unit;
  }, 0);

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle={`Last 12 months · ${pos.length} POs · ${pendingInvoices} tickets awaiting invoice${borough ? ` · ${borough}` : ""}`}
        actions={<BoroughFilter boroughs={boroughs} selected={borough} />}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-4">
        <Kpi label="Total PO issued" value={formatCents(totalIssuedCents)} />
        <Kpi label="Invoiced" value={formatCents(invoicedCents)} tone="success" />
        <Kpi
          label="Outstanding"
          value={formatCents(outstandingCents)}
          tone={outstandingCents > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Inventory value"
          value={formatCents(inventoryValueCents)}
          hint="warehouse-wide"
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          PO spend by month
        </h2>
        {monthRows.length === 0 ? (
          <p className="text-sm text-slate-400">No PO activity yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {monthRows.map(([month, cents]) => (
              <li
                key={month}
                className="flex items-center gap-3 rounded bg-surface-muted/40 px-3 py-1.5"
              >
                <span className="w-20 font-medium tracking-tight text-xs text-slate-400">
                  {month}
                </span>
                <span
                  className="h-4 rounded bg-accent/80"
                  style={{ width: `${(cents / monthMax) * 60}%` }}
                />
                <span className="ml-auto font-medium tracking-tight text-xs">
                  {formatCents(cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Spend by district
        </h2>
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">District</th>
                <th className="px-3 py-2 font-medium">Borough</th>
                <th className="px-3 py-2 font-medium">PO count</th>
                <th className="px-3 py-2 font-medium">Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {districtRows.map(([id, row]) => (
                <tr key={id}>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {row.region ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium tracking-tight text-xs">{row.poCount}</td>
                  <td className="px-3 py-2 font-medium tracking-tight">
                    {formatCents(row.amountCents)}
                  </td>
                </tr>
              ))}
              {districtRows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No PO spend in the last 12 months.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Outstanding POs ({outstandingPoTotal.toLocaleString()})
          {outstandingPoTotal > recentPos.length && (
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              — showing the {recentPos.length} oldest
            </span>
          )}
        </h2>
        {recentPos.length === 0 ? (
          <p className="text-sm text-slate-400">
            All caught up — every issued PO has been invoiced.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recentPos.map((po) => (
              <li
                key={po.id}
                className="flex items-center justify-between rounded border border-surface-border bg-surface-muted/40 px-3 py-1.5"
              >
                <span className="font-medium tracking-tight text-accent">{po.poNumber}</span>
                <Link
                  href={`/tickets/${po.quote.ticket.incidentNumber}`}
                  className="font-medium tracking-tight text-xs text-slate-400 hover:text-white"
                >
                  {po.quote.ticket.incidentNumber}
                </Link>
                <span className="text-xs text-slate-500">
                  issued {po.issuedAt.toISOString().slice(0, 10)}
                </span>
                <span className="font-medium tracking-tight text-sm">
                  {formatCents(po.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Parts cost consumed (last 12 months)
        </h2>
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-4 text-sm">
          <div className="font-medium tracking-tight text-2xl">
            {formatCents(partsConsumedValueCents)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Total value of parts pulled out of inventory and consumed on
            repairs over the last twelve months
            {borough ? ` for ${borough} tickets` : ""}. Parts are stocked
            in one shared warehouse, so the inventory value above is
            warehouse-wide and does not narrow with this filter.
          </div>
        </div>
      </section>
    </>
  );
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "success" | "warn";
  hint?: string;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-surface-border bg-surface-muted";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

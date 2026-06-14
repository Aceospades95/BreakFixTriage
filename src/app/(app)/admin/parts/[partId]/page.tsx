import Link from "next/link";
import { notFound } from "next/navigation";
import { PartMovementKind } from "@prisma/client";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { applyPartMovementAction } from "@/server/actions/parts";

export const dynamic = "force-dynamic";

export default async function PartDetailPage({
  params,
  searchParams,
}: {
  params: { partId: string };
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const part = await prisma.part.findUnique({
    where: { id: params.partId },
    include: {
      compatibleModels: true,
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { name: true } },
          ticket: {
            select: { id: true, incidentNumber: true },
          },
        },
      },
      _count: { select: { usages: true } },
    },
  });
  if (!part) notFound();

  const low = part.reorderLevel > 0 && part.onHand <= part.reorderLevel;

  return (
    <>
      <PageHeader
        title={part.name}
        subtitle={`SKU ${part.sku}${part.location ? ` · ${part.location}` : ""}`}
        actions={
          <Link
            href="/admin/parts"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Parts
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <div className="rounded-lg border border-surface-border bg-surface-muted p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Stock
            </h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Metric label="On hand" value={String(part.onHand)} alert={low} />
              <Metric
                label="Reorder at"
                value={part.reorderLevel > 0 ? String(part.reorderLevel) : "—"}
              />
              <Metric
                label="Unit cost"
                value={
                  part.costCents != null
                    ? `$${(part.costCents / 100).toFixed(2)}`
                    : "—"
                }
              />
            </div>
            {low && (
              <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                At or below reorder level — place an order with your
                supplier.
              </p>
            )}
            {part.description && (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">
                {part.description}
              </p>
            )}
            {part.compatibleModels.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                  Compatible models
                </div>
                <ul className="text-xs text-slate-300">
                  {part.compatibleModels.map((m) => (
                    <li key={m.id}>
                      {m.manufacturer} {m.modelName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-muted p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Movement history
            </h2>
            {part.movements.length === 0 ? (
              <p className="text-sm text-slate-400">
                No movements yet. Receive stock with the form on the right.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {part.movements.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded border border-surface-border bg-surface px-3 py-2"
                  >
                    <div>
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase ${kindColor(m.kind)}`}
                      >
                        {m.kind}
                      </span>
                      <span
                        className={`ml-2 font-medium tracking-tight ${m.quantity >= 0 ? "text-emerald-300" : "text-red-300"}`}
                      >
                        {m.quantity >= 0 ? "+" : ""}
                        {m.quantity}
                      </span>
                      {m.ticket && (
                        <>
                          {" "}
                          <Link
                            href={`/tickets/${m.ticket.incidentNumber}`}
                            className="ml-2 font-medium tracking-tight text-xs text-accent hover:underline"
                          >
                            {m.ticket.incidentNumber}
                          </Link>
                        </>
                      )}
                      {m.reason && (
                        <div className="mt-0.5 text-xs text-slate-400">
                          {m.reason}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <LocalTime date={m.createdAt} mode="datetime" />
                      {m.user && (
                        <div className="text-slate-400">{m.user.name}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Record movement
            </h2>
            <form action={applyPartMovementAction} className="space-y-3">
              <input type="hidden" name="partId" value={part.id} />
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">
                  Kind
                </label>
                <select
                  name="kind"
                  required
                  defaultValue={PartMovementKind.RECEIVED}
                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {Object.values(PartMovementKind).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">
                  Quantity
                </label>
                <input
                  type="number"
                  name="quantity"
                  required
                  defaultValue={1}
                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  For adjustments, use negative numbers to subtract. For
                  every other kind, positive values are interpreted
                  correctly.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">
                  Reason
                </label>
                <textarea
                  name="reason"
                  rows={2}
                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
              >
                Apply
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-muted p-4 text-xs text-slate-400">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
              Usage
            </div>
            Used on {part._count.usages} repair{part._count.usages === 1 ? "" : "s"}.
          </div>
        </aside>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`mt-0.5 font-medium tracking-tight text-xl ${alert ? "text-amber-300" : "text-slate-100"}`}
      >
        {value}
      </div>
    </div>
  );
}

function kindColor(kind: PartMovementKind): string {
  switch (kind) {
    case "RECEIVED":
      return "bg-emerald-500/20 text-emerald-200";
    case "CONSUMED":
      return "bg-indigo-500/20 text-indigo-200";
    case "ADJUSTMENT":
      return "bg-slate-500/20 text-slate-200";
    case "RETURNED":
      return "bg-amber-500/20 text-amber-200";
    case "SCRAPPED":
      return "bg-red-500/20 text-red-200";
  }
}

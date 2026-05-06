import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  attachPurchaseOrderAction,
  markPoInvoicedAction,
} from "@/server/actions/quotes";

export const dynamic = "force-dynamic";

/**
 * Invoice queue. Shows every ticket in INVOICE_REQUIRED along with the
 * attached PO (if any) and an inline form to either attach a PO (first
 * time) or mark the existing PO invoiced and close the ticket.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  // Invoices are only accessible to managers and admins
  const session = await requireRole(PERMISSIONS.QUOTES_READ, PERMISSIONS.TICKETS_WRITE);
  const canWrite = can(session.role, PERMISSIONS.QUOTES_WRITE);

  const tickets = await prisma.ticket.findMany({
    where: { state: "INVOICE_REQUIRED" },
    orderBy: { reportedAt: "asc" },
    include: {
      school: { select: { name: true, code: true } },
      quotes: {
        where: { status: QuoteStatus.APPROVED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { purchaseOrder: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Tickets returned to the school that still owe a PO and an invoice."
        actions={
          <a
            href="/api/exports/invoices"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ⬇ Export CSV
          </a>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
          Nothing in the invoice queue. 🎉
        </div>
      ) : (
        <ul className="space-y-4">
          {tickets.map((t) => {
            const latestQuote = t.quotes[0];
            const po = latestQuote?.purchaseOrder ?? null;
            return (
              <li
                key={t.id}
                className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="font-medium tracking-tight text-accent hover:underline"
                      >
                        {t.incidentNumber}
                      </Link>
                      <span className="ml-2 text-slate-300">
                        {t.shortDescription}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {t.school.name}
                      {t.school.code && (
                        <span className="ml-2 font-medium tracking-tight text-slate-500">
                          {t.school.code}
                        </span>
                      )}
                      <span className="mx-2">·</span>
                      reported {t.reportedAt.toISOString().slice(0, 10)}
                    </div>
                    {latestQuote ? (
                      <div className="mt-2 text-xs text-slate-300">
                        Approved quote{" "}
                        <span className="font-medium tracking-tight text-slate-400">
                          {latestQuote.id.slice(-6)}
                        </span>
                        {latestQuote.amountCents != null && (
                          <>
                            {" "}
                            · ${(latestQuote.amountCents / 100).toFixed(2)}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-amber-300">
                        No approved quote attached to this ticket — create
                        one on the ticket page before invoicing.
                      </div>
                    )}
                  </div>
                </div>

                {canWrite && latestQuote && (
                  <div className="mt-4 space-y-3 border-t border-surface-border pt-3">
                    {!po ? (
                      <form
                        action={attachPurchaseOrderAction}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <input
                          type="hidden"
                          name="quoteId"
                          value={latestQuote.id}
                        />
                        <input type="hidden" name="ticketId" value={t.id} />
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            PO number
                          </span>
                          <input
                            type="text"
                            name="poNumber"
                            required
                            placeholder="PO-2025-00123"
                            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            Amount ($)
                          </span>
                          <input
                            type="text"
                            name="amount"
                            required
                            inputMode="decimal"
                            placeholder="199.00"
                            defaultValue={
                              latestQuote.amountCents != null
                                ? (latestQuote.amountCents / 100).toFixed(2)
                                : ""
                            }
                            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                          />
                        </label>
                        <button
                          type="submit"
                          className="self-end rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
                        >
                          Attach PO
                        </button>
                      </form>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <div className="rounded border border-surface-border bg-surface p-3 text-xs">
                          <div className="text-[10px] uppercase tracking-wide text-slate-400">
                            Attached PO
                          </div>
                          <div className="mt-1 font-medium tracking-tight text-sm">
                            {po.poNumber}
                          </div>
                          <div className="mt-1 text-slate-400">
                            ${(po.amountCents / 100).toFixed(2)} · issued{" "}
                            {po.issuedAt.toISOString().slice(0, 10)}
                            {po.invoicedAt && (
                              <>
                                {" "}
                                · invoiced{" "}
                                {po.invoicedAt.toISOString().slice(0, 10)}
                              </>
                            )}
                          </div>
                        </div>
                        {!po.invoicedAt ? (
                          <form
                            action={markPoInvoicedAction}
                            className="flex flex-col gap-2"
                          >
                            <input type="hidden" name="poId" value={po.id} />
                            <input
                              type="hidden"
                              name="ticketId"
                              value={t.id}
                            />
                            <label className="flex items-center gap-1 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                name="closeTicket"
                                defaultChecked
                                className="accent-accent"
                              />
                              Close ticket after marking invoiced
                            </label>
                            <button
                              type="submit"
                              className="rounded bg-emerald-500/80 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                            >
                              Mark invoiced
                            </button>
                          </form>
                        ) : (
                          <div className="self-center text-xs text-emerald-300">
                            ✓ Invoiced
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

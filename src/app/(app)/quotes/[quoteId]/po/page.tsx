import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { formatCents } from "@/lib/format";
import { ticketWhereForSession } from "@/lib/data/forSession";

export const dynamic = "force-dynamic";

/**
 * Round-20 — NY team: "Triage can generate POs for customer."
 *
 * Printable customer purchase order for an approved quote. Follows
 * the established print-sheet pattern (ticket + route print pages):
 * inline @media print CSS hides the app chrome, the sheet itself is
 * white/black for paper.
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: { quoteId: string };
}) {
  const session = await requireRole(PERMISSIONS.QUOTES_READ);

  const quote = await prisma.quote.findFirst({
    // ADR 0014 — 404 (not 403) on a cross-district quote id so the
    // printable PO can't leak another district's billing details.
    where: {
      id: params.quoteId,
      ticket: ticketWhereForSession(session),
    },
    include: {
      purchaseOrder: true,
      ticket: {
        include: {
          school: {
            select: {
              name: true,
              code: true,
              address: true,
              district: { select: { name: true, code: true } },
            },
          },
          device: {
            select: {
              assetTag: true,
              serialNumber: true,
              model: { select: { manufacturer: true, modelName: true } },
            },
          },
        },
      },
    },
  });
  if (!quote || !quote.purchaseOrder) notFound();
  const po = quote.purchaseOrder;
  const ticket = quote.ticket;
  const address = ticket.school.address;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: letter; margin: 0.5in; }
            @media print {
              aside, header[data-app-chrome], nav[data-app-chrome] {
                display: none !important;
              }
              body { background: white !important; color: black !important; }
              .no-print { display: none !important; }
            }
          `,
        }}
      />

      <div className="no-print mb-4 flex items-center gap-2">
        <Link
          href={`/tickets/${ticket.incidentNumber}`}
          className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
        >
          ← Back to ticket
        </Link>
        <span className="text-xs text-slate-400">
          Use your browser&apos;s Print to save as PDF or print for the
          customer.
        </span>
      </div>

      <article
        data-testid="po-sheet"
        className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-slate-900 print:p-4 print:text-black"
      >
        <header className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-bold tracking-tight">
              Purchase Order
            </h1>
            <span className="text-xl font-semibold">{po.poNumber}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between text-sm">
            <span>BreakFix Triage — Device Repair Services</span>
            <span>
              <strong>Issued:</strong> {po.issuedAt.toISOString().slice(0, 10)}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider">
              Bill to
            </h2>
            <div>
              <strong>{ticket.school.district.name}</strong>
              {ticket.school.district.code && (
                <span className="ml-1 text-slate-600">
                  ({ticket.school.district.code})
                </span>
              )}
            </div>
            <div>{ticket.school.name}</div>
            {address && (
              <div className="text-slate-700">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""},{" "}
                {address.city}, {address.state} {address.postalCode}
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider">
              Reference
            </h2>
            <div>
              Ticket <strong>{ticket.incidentNumber}</strong>
            </div>
            {ticket.device && (
              <div className="text-slate-700">
                {ticket.device.model
                  ? `${ticket.device.model.manufacturer} ${ticket.device.model.modelName} · `
                  : ""}
                {ticket.device.assetTag ?? ticket.device.serialNumber}
              </div>
            )}
          </div>
        </section>

        <section>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-400 text-left">
                <th className="py-2 pr-4 font-semibold">Description</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">
                  {quote.diagnosticOnly ? "Diagnostic service" : "Repair service"}{" "}
                  — {ticket.shortDescription}
                  {quote.notes && (
                    <div className="text-xs text-slate-600">{quote.notes}</div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(po.amountCents)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4 text-right font-semibold">Total</td>
                <td className="py-2 text-right text-lg font-bold tabular-nums">
                  {formatCents(po.amountCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="grid grid-cols-2 gap-6 pt-8 text-sm">
          <div>
            <div className="border-t border-slate-400 pt-1">
              Authorized by (customer)
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1">Date</div>
          </div>
        </section>

        <footer className="border-t border-slate-300 pt-3 text-xs text-slate-600">
          Quote approved{" "}
          {quote.respondedAt
            ? quote.respondedAt.toISOString().slice(0, 10)
            : "—"}{" "}
          · This purchase order references the repair authorised under
          ticket {ticket.incidentNumber}.
          {po.invoiceRequired && " An invoice follows on completion."}
        </footer>
      </article>
    </>
  );
}

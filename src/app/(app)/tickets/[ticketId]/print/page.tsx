import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { PrintAutoTrigger } from "./print-auto-trigger";

export const dynamic = "force-dynamic";

/**
 * Round-6 §3B — Print Work Order.
 *
 * Print-optimized full-page render of a single ticket. The (app)
 * layout still wraps this; the inline <style> below hides the
 * sidebar / topbar / chrome via @media print, and the page itself
 * uses bg-white / black text so a printed copy is legible. Append
 * `?autoprint=1` to fire `window.print()` on mount.
 *
 * Round-5 §C / route Print sheet established the same pattern —
 * see /scheduling/routes/[routeId]/print.
 */
export default async function TicketPrintPage({
  params,
  searchParams,
}: {
  params: { ticketId: string };
  searchParams?: { autoprint?: string };
}) {
  await requireRole(PERMISSIONS.TICKETS_READ);

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.ticketId },
    include: {
      school: {
        select: {
          name: true,
          code: true,
          address: true,
          contacts: {
            where: { receivesTicketEmails: true },
            select: { name: true, email: true, phone: true, title: true },
          },
        },
      },
      device: {
        select: {
          assetTag: true,
          serialNumber: true,
          model: { select: { manufacturer: true, modelName: true } },
        },
      },
      assignee: { select: { name: true } },
    },
  });
  if (!ticket) notFound();

  const autoPrint = searchParams?.autoprint === "1";

  const reportedAt = ticket.reportedAt.toISOString().slice(0, 10);
  const spoc = ticket.school.contacts[0];
  const address = ticket.school.address;
  const addressLine = address
    ? [address.line1, address.line2, address.city, address.state, address.postalCode]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <>
      {/* Hide app chrome on print. The (app) layout's sidebar/topbar
          are not data-print-hide aware; this works because the
          sidebar uses `aside` and the topbar `header.app-chrome`
          (or similar). Inline so it ships even before a global
          print stylesheet exists. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: letter; margin: 0.5in; }
            @media print {
              aside, header[data-app-chrome], nav[data-app-chrome] {
                display: none !important;
              }
              body { background: white !important; color: black !important; }
            }
          `,
        }}
      />
      {autoPrint && <PrintAutoTrigger />}

      <article className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-slate-900 print:p-4 print:text-black">
        <header className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-bold tracking-tight">
              Work Order — {ticket.incidentNumber}
            </h1>
            <span className="text-sm">
              <strong>Reported:</strong> {reportedAt}
            </span>
          </div>
          <p className="mt-2 text-base">{ticket.shortDescription}</p>
        </header>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
            School
          </h2>
          <div className="text-sm">
            <div>
              <strong>{ticket.school.name}</strong>
              {ticket.school.code && (
                <span className="ml-2 text-slate-600">
                  ({ticket.school.code})
                </span>
              )}
            </div>
            {addressLine && <div className="text-slate-700">{addressLine}</div>}
          </div>
        </section>

        {spoc && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
              SPOC contact
            </h2>
            <div className="text-sm">
              <div>
                <strong>{spoc.name}</strong>
                {spoc.title && (
                  <span className="ml-2 text-slate-600">— {spoc.title}</span>
                )}
              </div>
              {spoc.email && <div>{spoc.email}</div>}
              {spoc.phone && <div>{spoc.phone}</div>}
            </div>
          </section>
        )}

        {ticket.device && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
              Device
            </h2>
            <div className="text-sm">
              {ticket.device.model && (
                <div>
                  <strong>
                    {ticket.device.model.manufacturer}{" "}
                    {ticket.device.model.modelName}
                  </strong>
                </div>
              )}
              <div>
                <span className="text-slate-600">Asset tag:</span>{" "}
                <code className="bg-slate-100 px-1">
                  {ticket.device.assetTag ?? "—"}
                </code>
              </div>
              <div>
                <span className="text-slate-600">Serial:</span>{" "}
                <code className="bg-slate-100 px-1">
                  {ticket.device.serialNumber}
                </code>
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
            Status
          </h2>
          <div className="text-sm">
            <div>
              <strong>Current:</strong> {humanise(ticket.state)}
            </div>
            <div>
              <strong>Priority:</strong> {humanise(ticket.priority)}
            </div>
            {ticket.assignee && (
              <div>
                <strong>Assigned to:</strong> {ticket.assignee.name}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
            Notes / observations
          </h2>
          <div className="min-h-[6rem] border border-slate-300" />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
            Sign-off
          </h2>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="mb-12 border-b border-slate-900" />
              <div>Tech signature</div>
              <div className="text-xs text-slate-600">Date</div>
            </div>
            <div>
              <div className="mb-12 border-b border-slate-900" />
              <div>School representative</div>
              <div className="text-xs text-slate-600">Date</div>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-300 pt-3 text-center text-xs text-slate-500">
          BreakFix Triage · {ticket.incidentNumber} · printed{" "}
          {new Date().toISOString().slice(0, 10)}
        </footer>
      </article>
    </>
  );
}

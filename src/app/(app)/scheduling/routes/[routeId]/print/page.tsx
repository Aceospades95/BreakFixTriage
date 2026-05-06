import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Printable route sheet for drivers who want paper. Intentionally
 * minimal styling — no header, no nav, just a clean page you can
 * send to a laser printer or save as PDF. The enclosing (app)
 * layout still renders, so press Cmd/Ctrl+P and the layout's
 * `print:hidden` utility classes (not used here) should be enough.
 *
 * TODO (Phase 8): add print-specific CSS to hide the header and
 * sidebar. For now the rendered output is usable but includes the
 * app chrome.
 */
export default async function PrintRoutePage({
  params,
}: {
  params: { routeId: string };
}) {
  await requireRole(PERMISSIONS.SCHEDULING_READ);

  const route = await prisma.route.findUnique({
    where: { id: params.routeId },
    include: {
      assignee: { select: { name: true } },
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          job: {
            include: {
              school: {
                select: {
                  name: true,
                  code: true,
                  address: true,
                  mainContact: true,
                },
              },
              ticketLinks: {
                include: {
                  ticket: {
                    select: {
                      id: true,
                      incidentNumber: true,
                      shortDescription: true,
                      device: { select: { serialNumber: true, assetTag: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!route) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-slate-900 print:p-4 print:text-black">
      <div className="border-b-2 border-slate-900 pb-4">
        <h1 className="text-3xl font-bold">
          Route Sheet — {route.date.toISOString().slice(0, 10)}
        </h1>
        <div className="mt-2 text-sm">
          <strong>Driver:</strong> {route.assignee.name}
          {route.vehicleRef && (
            <>
              <span className="mx-2">·</span>
              <strong>Vehicle:</strong> {route.vehicleRef}
            </>
          )}
          <span className="mx-2">·</span>
          <strong>Stops:</strong> {route.stops.length}
        </div>
      </div>

      <ol className="space-y-5">
        {route.stops.map((stop) => (
          <li key={stop.id} className="break-inside-avoid border-b border-slate-300 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 text-lg font-bold">
                {stop.sequence}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">
                    {stop.job.school.name}
                    {stop.job.school.code && (
                      <span className="ml-2 text-sm font-normal text-slate-600">
                        ({stop.job.school.code})
                      </span>
                    )}
                  </h2>
                  <span className="rounded border border-slate-900 px-2 py-0.5 text-xs font-bold uppercase">
                    {stop.job.type}
                  </span>
                </div>

                {stop.job.school.address && (
                  <div className="mt-1 text-sm">
                    {stop.job.school.address.line1}
                    {stop.job.school.address.line2 && (
                      <>, {stop.job.school.address.line2}</>
                    )}
                    <br />
                    {stop.job.school.address.city},{" "}
                    {stop.job.school.address.state}{" "}
                    {stop.job.school.address.postalCode}
                  </div>
                )}

                {stop.job.school.mainContact && (
                  <div className="mt-1 text-sm">
                    <strong>Contact:</strong>{" "}
                    {stop.job.school.mainContact.name}
                    {stop.job.school.mainContact.phone && (
                      <> · {stop.job.school.mainContact.phone}</>
                    )}
                    {stop.job.school.mainContact.email && (
                      <> · {stop.job.school.mainContact.email}</>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <div className="text-xs font-bold uppercase text-slate-600">
                    Devices ({stop.job.ticketLinks.length})
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {stop.job.ticketLinks.map((tl) => (
                      <li key={tl.ticket.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          readOnly
                        />
                        <span className="font-medium tracking-tight">
                          {tl.ticket.incidentNumber}
                        </span>
                        {tl.ticket.device && (
                          <span className="font-medium tracking-tight text-xs">
                            {tl.ticket.device.serialNumber}
                            {tl.ticket.device.assetTag && (
                              <> / {tl.ticket.device.assetTag}</>
                            )}
                          </span>
                        )}
                        <span className="flex-1">
                          — {tl.ticket.shortDescription}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 text-xs">
                  <div className="grid grid-cols-[100px_1fr] gap-y-1">
                    <span className="font-bold">Arrived at:</span>
                    <span className="border-b border-slate-400">&nbsp;</span>
                    <span className="font-bold">Departed at:</span>
                    <span className="border-b border-slate-400">&nbsp;</span>
                    <span className="font-bold">Signed by:</span>
                    <span className="border-b border-slate-400">&nbsp;</span>
                    <span className="font-bold">Notes:</span>
                    <span className="border-b border-slate-400">&nbsp;</span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="border-t-2 border-slate-900 pt-4 text-xs text-slate-600">
        Printed from BreakFix Triage · route {route.id}
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { TicketState, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

/**
 * CSV export of the ticket list. Honors the same `state` and `q`
 * query-string filters as the /tickets page, so the "Export CSV"
 * button on that page just posts to this URL with the current
 * URLSearchParams and the browser downloads the result.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.TICKETS_READ))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const stateRaw = url.searchParams.get("state");
  const validStates = Object.values(TicketState) as string[];
  const stateFilter =
    stateRaw && validStates.includes(stateRaw)
      ? (stateRaw as TicketState)
      : undefined;
  const query = url.searchParams.get("q")?.trim() ?? "";

  const where: Prisma.TicketWhereInput = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(query
      ? {
          OR: [
            { incidentNumber: { contains: query, mode: "insensitive" } },
            { shortDescription: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { reportedAt: "desc" },
    include: {
      school: { select: { name: true, code: true } },
      device: { select: { serialNumber: true, assetTag: true } },
      assignee: { select: { name: true } },
    },
    take: 10000,
  });

  const csv = rowsToCsv(tickets, [
    { header: "Incident Number", get: (t) => t.incidentNumber },
    { header: "State", get: (t) => t.state },
    { header: "Priority", get: (t) => t.priority },
    { header: "Assignee", get: (t) => t.assignee?.name ?? "" },
    { header: "School", get: (t) => t.school.name },
    { header: "School Code", get: (t) => t.school.code ?? "" },
    { header: "Device Serial", get: (t) => t.device?.serialNumber ?? "" },
    { header: "Asset Tag", get: (t) => t.device?.assetTag ?? "" },
    { header: "Short Description", get: (t) => t.shortDescription },
    { header: "Reported At", get: (t) => t.reportedAt },
    { header: "Closed At", get: (t) => t.closedAt },
    { header: "Invoice Required", get: (t) => t.invoiceRequired },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("tickets")}"`,
    },
  });
}

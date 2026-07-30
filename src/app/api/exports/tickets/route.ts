import { NextResponse } from "next/server";
import { TicketState, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { schoolWhereForBorough } from "@/lib/geo/boroughs";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";
import { getSlaThresholds } from "@/lib/settings/settings";
import { slaBreachedWhere } from "@/lib/reports/sla-filter";

/**
 * CSV export of the ticket list. Honors every filter the /tickets
 * page supports — state (including the virtual `open`), q, school,
 * manufacturer, assignee (including `unassigned`), and
 * slaHealth=breached — so the "Export CSV" button downloads exactly
 * the rows on screen. Round-21: school/manufacturer used to be
 * silently dropped here, so a filtered export contained more rows
 * than the operator was looking at.
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
  const openOnly = stateRaw === "open";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const schoolFilter = url.searchParams.get("school") || undefined;
  // Five-borough expansion — the list page sends these, so the
  // export must honour them or a filtered download silently contains
  // more rows than the operator was looking at.
  const boroughFilter = url.searchParams.get("borough") || undefined;
  const districtFilter = url.searchParams.get("district") || undefined;
  const schoolIsId = schoolFilter
    ? /^c[a-z0-9]{20,}$/i.test(schoolFilter)
    : false;
  const schoolConditions: Prisma.SchoolWhereInput[] = [];
  const boroughWhere = schoolWhereForBorough(boroughFilter);
  if (Object.keys(boroughWhere).length > 0) schoolConditions.push(boroughWhere);
  if (districtFilter) schoolConditions.push({ districtId: districtFilter });
  if (schoolFilter && !schoolIsId) {
    schoolConditions.push({
      OR: [
        { name: { contains: schoolFilter, mode: "insensitive" } },
        { code: { contains: schoolFilter, mode: "insensitive" } },
      ],
    });
  }
  const schoolClause: Prisma.SchoolWhereInput | null =
    schoolConditions.length === 0
      ? null
      : schoolConditions.length === 1
        ? schoolConditions[0]!
        : { AND: schoolConditions };
  const manufacturerFilter = url.searchParams.get("manufacturer") || undefined;
  const assigneeFilter = url.searchParams.get("assignee") || undefined;
  const slaBreachedOnly = url.searchParams.get("slaHealth") === "breached";

  const slaBreachedClause = slaBreachedOnly
    ? slaBreachedWhere(await getSlaThresholds())
    : null;

  // Round-16 (B17) — tenant scope per ADR 0014: non-admin exports
  // only contain tickets from the actor's districts.
  // Composed, not spread: the tenant scope and the borough/district/
  // school-name filters all own the `school` key (see andTicketWhere).
  const where: Prisma.TicketWhereInput = andTicketWhere(
    ticketWhereForSession(session),
    schoolClause ? { school: schoolClause } : null,
    {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(openOnly ? { state: { not: TicketState.CLOSED } } : {}),
    ...(slaBreachedClause ? { AND: [slaBreachedClause] } : {}),
    ...(schoolFilter && schoolIsId ? { schoolId: schoolFilter } : {}),
    ...(assigneeFilter
      ? assigneeFilter === "unassigned"
        ? { assignedUserId: null }
        : { assignedUserId: assigneeFilter }
      : {}),
    ...(manufacturerFilter
      ? { device: { model: { manufacturer: manufacturerFilter } } }
      : {}),
    ...(query
      ? {
          OR: [
            { incidentNumber: { contains: query, mode: "insensitive" } },
            { shortDescription: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    },
  );

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

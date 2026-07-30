import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { ticketWhereForSession } from "@/lib/data/forSession";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";
import { districtIdsFor } from "@/lib/geo/borough-options";
import { boroughRollup } from "@/lib/reports/boroughs";

/**
 * CSV of the per-borough comparison — the version that gets pasted
 * into a deck or a weekly email.
 *
 * Same rollup function as /dashboards/boroughs and the same window
 * parameter, so the download always matches the screen (the
 * export-matches-the-page invariant this codebase holds). Tenant
 * scoped, so a district-scoped user exports only their boroughs.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.REPORTS_READ))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const daysParsed = parseInt(url.searchParams.get("days") ?? "", 10);
  const windowDays = [7, 30, 90].includes(daysParsed) ? daysParsed : 30;

  const report = await boroughRollup(prisma, {
    windowDays,
    scope: ticketWhereForSession(session),
    districtIds: districtIdsFor(session),
  });

  // Totals ride along as a final row so the spreadsheet reconciles
  // without the reader having to re-sum it.
  const rows = [...report.rows, report.total];

  const csv = rowsToCsv(rows, [
    { header: "Borough", get: (r) => r.borough },
    { header: "Districts", get: (r) => r.districts },
    { header: "Schools", get: (r) => r.schools },
    { header: "Open Tickets", get: (r) => r.openTickets },
    { header: `Aging Over ${report.agingThresholdDays}d`, get: (r) => r.aging },
    { header: "SLA Breached", get: (r) => r.breached },
    { header: "Imported No Triage 30d+", get: (r) => r.importedBacklog },
    { header: `Closed Last ${windowDays}d`, get: (r) => r.closedInWindow },
    {
      header: "Avg Turnaround Days",
      get: (r) => r.avgTurnaroundDays ?? "",
    },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("boroughs")}"`,
    },
  });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";
import {
  buildSiteSummary,
  siteSummaryToRows,
  type SummaryPeriod,
} from "@/lib/reports/site-summary";

/**
 * Round-22 §4 — CSV export of a per-site weekly/monthly summary.
 * `?schoolId=...&period=week|month`.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.REPORTS_READ))) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId") ?? "";
  const period: SummaryPeriod =
    url.searchParams.get("period") === "month" ? "month" : "week";
  if (!schoolId) {
    return new NextResponse("schoolId is required", { status: 400 });
  }

  const summary = await buildSiteSummary(schoolId, period);
  if (!summary) return new NextResponse("school not found", { status: 404 });

  const csv = rowsToCsv(siteSummaryToRows(summary), [
    { header: "Metric", get: (r) => r.metric },
    { header: "Value", get: (r) => r.value },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(`site-summary-${period}`)}"`,
    },
  });
}

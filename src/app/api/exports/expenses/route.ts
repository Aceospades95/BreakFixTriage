import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";
import { compileExpenseWeek } from "@/lib/reports/expenses";

/**
 * Round-20 — weekly expense report as CSV (one row per expense
 * line, grouped by tech). `?week=YYYY-MM-DD` anchors the Mon–Sun
 * window; defaults to the current week.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (
    !session ||
    !(await canAsync(session.role, PERMISSIONS.EXPENSES_REVIEW))
  ) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const weekParam = request.nextUrl.searchParams.get("week");
  const anchor =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? new Date(`${weekParam}T00:00:00.000Z`)
      : new Date();

  const week = await compileExpenseWeek(anchor, prisma);
  const rows = week.techs.flatMap((t) =>
    t.lines.map((l) => ({ tech: t.techName, ...l })),
  );

  const csv = rowsToCsv(rows, [
    { header: "Tech", get: (r) => r.tech },
    { header: "Date", get: (r) => r.incurredOn },
    { header: "Kind", get: (r) => r.kind },
    { header: "Amount", get: (r) => r.amountCents / 100 },
    { header: "Status", get: (r) => r.status },
    { header: "Location(s)", get: (r) => r.location ?? "" },
    { header: "Route Date", get: (r) => r.routeDate ?? "" },
    { header: "Description", get: (r) => r.description ?? "" },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(
        `expenses-week-${week.weekStart}`,
      )}"`,
    },
  });
}

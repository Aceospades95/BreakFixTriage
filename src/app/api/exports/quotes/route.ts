import { NextResponse } from "next/server";
import { QuoteStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !can(session.role, PERMISSIONS.QUOTES_READ)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const validStatuses = Object.values(QuoteStatus) as string[];
  const where: Prisma.QuoteWhereInput | undefined =
    statusRaw && validStatuses.includes(statusRaw)
      ? { status: statusRaw as QuoteStatus }
      : undefined;

  const quotes = await prisma.quote.findMany({
    where,
    include: { ticket: { include: { school: true } }, purchaseOrder: true },
    orderBy: { updatedAt: "desc" },
    take: 10000,
  });

  const csv = rowsToCsv(quotes, [
    { header: "Ticket", get: (q) => q.ticket.incidentNumber },
    { header: "School", get: (q) => q.ticket.school.name },
    { header: "Quote Status", get: (q) => q.status },
    { header: "Ticket State", get: (q) => q.ticket.state },
    {
      header: "Amount",
      get: (q) => (q.amountCents != null ? q.amountCents / 100 : ""),
    },
    { header: "Diagnostic Only", get: (q) => q.diagnosticOnly },
    { header: "Sent At", get: (q) => q.sentAt },
    { header: "Hold Until", get: (q) => q.holdUntil },
    { header: "Responded At", get: (q) => q.respondedAt },
    { header: "PO Number", get: (q) => q.purchaseOrder?.poNumber ?? "" },
    { header: "Invoiced At", get: (q) => q.purchaseOrder?.invoicedAt },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("quotes")}"`,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

export async function GET() {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.QUOTES_READ))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { state: "INVOICE_REQUIRED" },
    include: {
      school: { select: { name: true, code: true } },
      quotes: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { purchaseOrder: true },
      },
    },
    orderBy: { reportedAt: "asc" },
    take: 10000,
  });

  const rows = tickets.map((t) => ({
    ticket: t.incidentNumber,
    school: t.school.name,
    schoolCode: t.school.code,
    quote: t.quotes[0],
    po: t.quotes[0]?.purchaseOrder ?? null,
  }));

  const csv = rowsToCsv(rows, [
    { header: "Ticket", get: (r) => r.ticket },
    { header: "School", get: (r) => r.school },
    { header: "School Code", get: (r) => r.schoolCode },
    {
      header: "Amount",
      get: (r) =>
        r.quote?.amountCents != null ? r.quote.amountCents / 100 : "",
    },
    { header: "PO Number", get: (r) => r.po?.poNumber ?? "" },
    { header: "PO Issued At", get: (r) => r.po?.issuedAt },
    { header: "Invoiced At", get: (r) => r.po?.invoicedAt },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("invoices")}"`,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { ticketWhereForSession } from "@/lib/data/forSession";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import {
  csvFilename,
  rowsToCsv,
  truncationHeaders,
  withTruncationNotice,
} from "@/lib/reports/csv-export";

export async function GET() {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.QUOTES_READ))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    // Round-16 (B17) — tenant scope per ADR 0014.
    where: {
      AND: [ticketWhereForSession(session), { state: "INVOICE_REQUIRED" }],
    },
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

  // True match count behind the row cap, so the download can
  // state what it left out instead of looking complete.
  const totalMatching = await prisma.ticket.count({
    where: {
      AND: [ticketWhereForSession(session), { state: "INVOICE_REQUIRED" }],
    },
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

  const body = withTruncationNotice(csv, tickets.length, totalMatching);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("invoices")}"`,
      ...truncationHeaders(tickets.length, totalMatching),
    },
  });
}

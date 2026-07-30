import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import {
  csvFilename,
  rowsToCsv,
  truncationHeaders,
  withTruncationNotice,
} from "@/lib/reports/csv-export";

/**
 * Round-11 §1D — admin Email log kebab "Export last 30 days CSV"
 * target. Default range is the last 30 days; the kebab calls it
 * with no params. Custom ranges can be passed as ?from=YYYY-MM-DD
 * &to=YYYY-MM-DD.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.EMAIL_WRITE))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const to = toParam ? new Date(`${toParam}T23:59:59Z`) : new Date();
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00Z`)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const logs = await prisma.emailLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: 50000,
  });

  // True match count behind the 50000-row cap, so the download
  // can state what it left out instead of looking complete.
  const totalMatching = await prisma.emailLog.count({
    where: { createdAt: { gte: from, lte: to } },
  });

  const csv = rowsToCsv(logs, [
    { header: "Created At", get: (l) => l.createdAt },
    { header: "Sent At", get: (l) => l.sentAt },
    { header: "To", get: (l) => l.to.join(", ") },
    { header: "Cc", get: (l) => l.cc.join(", ") },
    { header: "Subject", get: (l) => l.subject },
    { header: "Status", get: (l) => l.status },
    { header: "Provider Message Id", get: (l) => l.providerMessageId ?? "" },
    { header: "Ticket Id", get: (l) => l.ticketId ?? "" },
    { header: "Template Id", get: (l) => l.templateId },
    { header: "Error", get: (l) => l.error ?? "" },
  ]);

  const body = withTruncationNotice(csv, logs.length, totalMatching);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("email-log")}"`,
      ...truncationHeaders(logs.length, totalMatching),
    },
  });
}

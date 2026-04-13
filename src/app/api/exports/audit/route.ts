import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { canAsync, PERMISSIONS } from "@/lib/auth/rbac";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await canAsync(session.role, PERMISSIONS.USERS_MANAGE))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const actor = url.searchParams.get("actor") ?? undefined;

  const where: Prisma.AuditLogWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (actor) {
    where.actor = { email: { contains: actor, mode: "insensitive" } };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { actor: { select: { name: true, email: true } } },
  });

  const csv = rowsToCsv(logs, [
    { header: "Timestamp", get: (l) => l.createdAt },
    { header: "Actor", get: (l) => l.actor?.name ?? "system" },
    { header: "Actor Email", get: (l) => l.actor?.email ?? "" },
    { header: "Entity Type", get: (l) => l.entityType },
    { header: "Entity ID", get: (l) => l.entityId },
    { header: "Action", get: (l) => l.action },
    {
      header: "Before",
      get: (l) => (l.before != null ? JSON.stringify(l.before) : ""),
    },
    {
      header: "After",
      get: (l) => (l.after != null ? JSON.stringify(l.after) : ""),
    },
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("audit")}"`,
    },
  });
}

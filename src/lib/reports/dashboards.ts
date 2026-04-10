import type { PrismaClient, TicketState } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * Queries that back the operational dashboards. Kept as a thin layer over
 * Prisma so they remain testable with a seeded DB.
 */

export async function openTicketsByState(db: PrismaClient = defaultPrisma) {
  const rows = await db.ticket.groupBy({
    by: ["state"],
    _count: { _all: true },
    where: { state: { not: "CLOSED" } },
  });
  return rows
    .map((r) => ({ state: r.state, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function closedTicketsByMonth(
  db: PrismaClient = defaultPrisma,
  months = 12,
) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await db.$queryRaw<
    { month: Date; count: bigint }[]
  >`SELECT date_trunc('month', "closedAt") AS month, COUNT(*)::bigint AS count
    FROM "Ticket"
    WHERE "closedAt" IS NOT NULL AND "closedAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC`;
  return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
}

export async function ticketsBySchool(
  db: PrismaClient = defaultPrisma,
  { open = true }: { open?: boolean } = {},
) {
  return db.ticket.groupBy({
    by: ["schoolId"],
    _count: { _all: true },
    where: open ? { state: { not: "CLOSED" } } : {},
  });
}

export async function agingTickets(
  db: PrismaClient = defaultPrisma,
  { thresholdDays = 30 }: { thresholdDays?: number } = {},
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);
  return db.ticket.findMany({
    where: {
      state: { not: "CLOSED" },
      reportedAt: { lt: cutoff },
    },
    orderBy: { reportedAt: "asc" },
    include: { school: true, device: true },
    take: 100,
  });
}

export async function duplicateQueueCount(db: PrismaClient = defaultPrisma) {
  return db.duplicateConflict.count({ where: { resolvedAt: null } });
}

export async function invoiceQueueCount(db: PrismaClient = defaultPrisma) {
  const states: TicketState[] = ["INVOICE_REQUIRED"];
  return db.ticket.count({ where: { state: { in: states } } });
}

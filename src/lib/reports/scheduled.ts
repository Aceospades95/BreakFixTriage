import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { humanise } from "@/lib/format";
import { compileExpenseWeek } from "./expenses";

/**
 * Round-20 — NY team: "Create Reports for customer and finance.
 * Automates daily, weekly, and monthly reports and emails."
 *
 * Two report families, three periods. The builders return plain
 * monospace text lines (the templates wrap them in <pre>) plus the
 * variables the report_operations / report_finance templates
 * interpolate. scripts/send-scheduled-reports.ts dispatches them
 * through the email chokepoint on whatever cron cadence the
 * deployment sets up.
 */

export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface ReportRange {
  start: Date;
  end: Date;
  periodLabel: string;
  rangeLabel: string;
}

export function periodRange(period: ReportPeriod, now = new Date()): ReportRange {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (period === "daily") {
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return {
      start,
      end,
      periodLabel: "Daily",
      rangeLabel: start.toISOString().slice(0, 10),
    };
  }
  if (period === "weekly") {
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start,
      end,
      periodLabel: "Weekly",
      rangeLabel: `${start.toISOString().slice(0, 10)} – ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`,
    };
  }
  // monthly: the previous calendar month.
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return {
    start: monthStart,
    end: monthEnd,
    periodLabel: "Monthly",
    rangeLabel: monthStart.toISOString().slice(0, 7),
  };
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Customer-facing operations summary: what moved in the window.
 */
export async function buildOperationsReport(
  period: ReportPeriod,
  db: PrismaClient = defaultPrisma,
  now = new Date(),
): Promise<{ range: ReportRange; lines: string }> {
  const range = periodRange(period, now);
  const { start, end } = range;

  const [opened, closed, openNow, byState, stopsCompleted, delays] =
    await Promise.all([
      db.ticket.count({ where: { reportedAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { closedAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { state: { not: "CLOSED" } } }),
      db.ticket.groupBy({
        by: ["state"],
        _count: { _all: true },
        where: { state: { not: "CLOSED" } },
        orderBy: { _count: { state: "desc" } },
        take: 8,
      }),
      db.routeStop.count({
        where: { status: "COMPLETED", arrivedAt: { gte: start, lt: end } },
      }),
      db.routeStop.count({
        where: { delayedAt: { gte: start, lt: end } },
      }),
    ]);

  const topSchools = await db.ticket.groupBy({
    by: ["schoolId"],
    _count: { _all: true },
    where: { reportedAt: { gte: start, lt: end } },
    orderBy: { _count: { schoolId: "desc" } },
    take: 5,
  });
  const schoolNames = await db.school.findMany({
    where: { id: { in: topSchools.map((s) => s.schoolId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(schoolNames.map((s) => [s.id, s.name]));

  const lines = [
    `Tickets opened:    ${opened}`,
    `Tickets closed:    ${closed}`,
    `Open right now:    ${openNow}`,
    `Stops completed:   ${stopsCompleted}`,
    `Delays reported:   ${delays}`,
    ``,
    `Open tickets by state:`,
    ...byState.map(
      (s) => `  ${humanise(s.state).padEnd(24)} ${s._count._all}`,
    ),
    ...(topSchools.length > 0
      ? [
          ``,
          `Busiest schools (new tickets):`,
          ...topSchools.map(
            (s) =>
              `  ${(nameOf.get(s.schoolId) ?? s.schoolId).padEnd(32)} ${s._count._all}`,
          ),
        ]
      : []),
  ].join("\n");

  return { range, lines };
}

/**
 * Finance summary: quotes, POs, invoices, and tech expenses.
 */
export async function buildFinanceReport(
  period: ReportPeriod,
  db: PrismaClient = defaultPrisma,
  now = new Date(),
): Promise<{ range: ReportRange; lines: string }> {
  const range = periodRange(period, now);
  const { start, end } = range;

  const [quotesSent, quotesApproved, posIssued, invoicesPending] =
    await Promise.all([
      db.quote.findMany({
        where: { sentAt: { gte: start, lt: end } },
        select: { amountCents: true },
      }),
      db.quote.findMany({
        where: { respondedAt: { gte: start, lt: end }, status: "APPROVED" },
        select: { amountCents: true },
      }),
      db.purchaseOrder.findMany({
        where: { issuedAt: { gte: start, lt: end } },
        select: { amountCents: true },
      }),
      db.ticket.count({ where: { state: "INVOICE_REQUIRED" } }),
    ]);

  const sum = (xs: { amountCents: number | null }[]) =>
    xs.reduce((s, x) => s + (x.amountCents ?? 0), 0);

  const lines: string[] = [
    `Quotes sent:       ${quotesSent.length}  (${money(sum(quotesSent))})`,
    `Quotes approved:   ${quotesApproved.length}  (${money(sum(quotesApproved))})`,
    `POs issued:        ${posIssued.length}  (${money(sum(posIssued))})`,
    `Awaiting invoice:  ${invoicesPending}`,
  ];

  // Tech expenses — compiled per week; the weekly report shows the
  // per-tech breakdown, daily/monthly show the window total.
  if (period === "weekly") {
    const week = await compileExpenseWeek(start, db);
    lines.push(
      ``,
      `Tech expenses ${week.weekStart} – ${week.weekEnd}: ${money(week.totalCents)} (${money(week.approvedCents)} approved)`,
    );
    for (const t of week.techs) {
      lines.push(
        `  ${t.techName.padEnd(24)} ${money(t.totalCents).padStart(10)}  (${t.lines.length} item${t.lines.length === 1 ? "" : "s"})`,
      );
      for (const l of t.lines) {
        lines.push(
          `    ${l.incurredOn}  ${humanise(l.kind).padEnd(8)} ${money(l.amountCents).padStart(9)}  ${l.status.toLowerCase()}${l.location ? `  ${l.location}` : ""}`,
        );
      }
    }
  } else {
    const expenses = await db.expense.findMany({
      where: { incurredOn: { gte: start, lt: end }, status: { not: "REJECTED" } },
      select: { amountCents: true },
    });
    lines.push(
      `Tech expenses:     ${expenses.length}  (${money(sum(expenses))})`,
    );
  }

  return { range, lines: lines.join("\n") };
}

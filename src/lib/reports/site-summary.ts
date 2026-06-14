import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * Round-22 §4 (Phase 4 reporting v1) — per-site weekly/monthly summary.
 *
 * One school, one period: what's been completed, what's pending, the
 * routes that ran, the field outcomes that went wrong (with reasons),
 * open exceptions, and aging. Rendered on the school page and
 * exportable as CSV; the same builder feeds the scheduled-report
 * machinery (sending is gated on outbound email being configured —
 * see scripts/send-scheduled-reports.ts).
 */

export type SummaryPeriod = "week" | "month";

const AGING_DAYS = 30;

export interface SiteSummary {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  period: SummaryPeriod;
  from: Date;
  to: Date;
  /** Open (non-closed) tickets grouped by state, descending. */
  openByState: { state: string; count: number }[];
  devicesPending: number;
  devicesCompleted: number;
  routesRun: number;
  failedStops: { reason: string; date: Date; sequence: number }[];
  partialStops: { reason: string; date: Date; sequence: number }[];
  openExceptions: number;
  agingOpen: number;
}

export function periodWindow(
  period: SummaryPeriod,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = now;
  const days = period === "week" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function buildSiteSummary(
  schoolId: string,
  period: SummaryPeriod,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<SiteSummary | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, code: true },
  });
  if (!school) return null;

  const { from, to } = periodWindow(period, now);
  const agingCutoff = new Date(now.getTime() - AGING_DAYS * 24 * 60 * 60 * 1000);

  const [openTickets, completed, terminalStops, routesRun, agingOpen] =
    await Promise.all([
      db.ticket.groupBy({
        by: ["state"],
        where: { schoolId, state: { notIn: ["CLOSED"] } },
        _count: { _all: true },
      }),
      // Resolved in window: returned to the school or formally closed.
      db.ticket.count({
        where: {
          schoolId,
          OR: [
            { state: "CLOSED", closedAt: { gte: from, lte: to } },
            { state: "RETURNED", stateEnteredAt: { gte: from, lte: to } },
          ],
        },
      }),
      db.routeStop.findMany({
        where: {
          job: { schoolId },
          route: { date: { gte: from, lte: to } },
          status: { in: ["FAILED", "PARTIAL"] },
        },
        select: {
          status: true,
          failureReason: true,
          sequence: true,
          route: { select: { date: true } },
        },
      }),
      db.route.count({
        where: {
          date: { gte: from, lte: to },
          stops: { some: { job: { schoolId } } },
        },
      }),
      db.ticket.count({
        where: {
          schoolId,
          state: { notIn: ["CLOSED"] },
          reportedAt: { lt: agingCutoff },
        },
      }),
    ]);

  const openByState = openTickets
    .map((g) => ({ state: g.state, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  const devicesPending = openByState.reduce((a, g) => a + g.count, 0);

  const failedStops = terminalStops
    .filter((s) => s.status === "FAILED")
    .map((s) => ({
      reason: s.failureReason ?? "(no reason recorded)",
      date: s.route.date,
      sequence: s.sequence,
    }));
  const partialStops = terminalStops
    .filter((s) => s.status === "PARTIAL")
    .map((s) => ({
      reason: s.failureReason ?? "partial completion",
      date: s.route.date,
      sequence: s.sequence,
    }));

  // Open field-outcome exceptions for this school's stops (unack warns).
  const stopIds = await db.routeStop.findMany({
    where: { job: { schoolId } },
    select: { id: true },
  });
  const openExceptions =
    stopIds.length === 0
      ? 0
      : await db.auditLog.count({
          where: {
            entityType: "RouteStop",
            entityId: { in: stopIds.map((s) => s.id) },
            severity: { in: ["warn", "critical"] },
            acknowledgedAt: null,
          },
        });

  return {
    schoolId: school.id,
    schoolName: school.name,
    schoolCode: school.code,
    period,
    from,
    to,
    openByState,
    devicesPending,
    devicesCompleted: completed,
    routesRun,
    failedStops,
    partialStops,
    openExceptions,
    agingOpen,
  };
}

/**
 * Round-22 §4 — the variables for the `report_site` email template
 * (mirrors the report_operations `{ report: { periodLabel, rangeLabel,
 * lines } }` shape). `lines` is the same flattened metric block as the
 * CSV export, rendered as text for the email body.
 */
export function siteSummaryReportVariables(s: SiteSummary): {
  report: {
    school: string;
    periodLabel: string;
    rangeLabel: string;
    lines: string;
  };
} {
  const lines = siteSummaryToRows(s)
    .map((r) => `${r.metric}: ${r.value}`)
    .join("\n");
  return {
    report: {
      school: `${s.schoolName}${s.schoolCode ? ` (${s.schoolCode})` : ""}`,
      periodLabel: s.period === "week" ? "Weekly" : "Monthly",
      rangeLabel: `${s.from.toISOString().slice(0, 10)} – ${s.to.toISOString().slice(0, 10)}`,
      lines,
    },
  };
}

/** Flatten a summary into labeled metric rows for CSV export. */
export function siteSummaryToRows(
  s: SiteSummary,
): { metric: string; value: string | number }[] {
  const rows: { metric: string; value: string | number }[] = [
    { metric: "School", value: `${s.schoolName}${s.schoolCode ? ` (${s.schoolCode})` : ""}` },
    { metric: "Period", value: s.period },
    { metric: "From", value: s.from.toISOString().slice(0, 10) },
    { metric: "To", value: s.to.toISOString().slice(0, 10) },
    { metric: "Devices completed (returned/closed)", value: s.devicesCompleted },
    { metric: "Devices pending (open)", value: s.devicesPending },
    { metric: "Routes run", value: s.routesRun },
    { metric: "Failed stops", value: s.failedStops.length },
    { metric: "Partial stops", value: s.partialStops.length },
    { metric: "Open exceptions", value: s.openExceptions },
    { metric: `Aging open (> ${AGING_DAYS}d)`, value: s.agingOpen },
  ];
  for (const g of s.openByState) {
    rows.push({ metric: `Open · ${g.state}`, value: g.count });
  }
  for (const f of s.failedStops) {
    rows.push({
      metric: `Failed stop ${f.date.toISOString().slice(0, 10)}`,
      value: f.reason,
    });
  }
  return rows;
}

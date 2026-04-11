/**
 * Daily digest report.
 *
 * Computes an operational snapshot intended for managers who want a
 * morning email instead of logging into the app. Returns a
 * structured object and a pre-rendered plain-text body.
 *
 * Run via `npm run digest` on a cron — the caller is responsible for
 * sending the rendered body through the notification transport.
 */

import { JobStatus, QuoteStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { daysInState, slaHealth } from "@/lib/reports/sla";
import { getSlaThresholds } from "@/lib/settings/settings";

export interface DigestReport {
  asOf: Date;
  openTicketCount: number;
  breachedSlaCount: number;
  approachingSlaCount: number;
  pendingPickupCount: number;
  pendingDeliveryCount: number;
  inWarehouseCount: number;
  quoteSentCount: number;
  expiringQuoteCount: number;
  invoiceRequiredCount: number;
  unassignedCount: number;
  duplicateQueueCount: number;
  unscheduledJobCount: number;
}

export async function buildDigestReport(
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<DigestReport> {
  const thresholds = await getSlaThresholds(db);

  const [
    openTickets,
    pendingPickup,
    pendingDelivery,
    inWarehouse,
    quoteSent,
    invoiceRequired,
    unassigned,
    duplicates,
    unscheduledJobs,
    expiringQuotes,
  ] = await Promise.all([
    db.ticket.findMany({
      where: { state: { notIn: ["CLOSED", "ON_HOLD"] } },
      select: {
        id: true,
        state: true,
        stateEnteredAt: true,
        reportedAt: true,
      },
    }),
    db.ticket.count({ where: { state: "AWAITING_PICKUP" } }),
    db.ticket.count({ where: { state: "PENDING_DELIVERY" } }),
    db.ticket.count({ where: { state: "IN_WAREHOUSE" } }),
    db.ticket.count({ where: { state: "QUOTE_SENT" } }),
    db.ticket.count({ where: { state: "INVOICE_REQUIRED" } }),
    db.ticket.count({
      where: {
        state: { notIn: ["CLOSED", "ON_HOLD"] },
        assignedUserId: null,
      },
    }),
    db.duplicateConflict.count({ where: { resolvedAt: null } }),
    db.job.count({ where: { status: JobStatus.UNSCHEDULED } }),
    db.quote.count({
      where: {
        status: QuoteStatus.SENT,
        holdUntil: { lte: now },
      },
    }),
  ]);

  let breached = 0;
  let approaching = 0;
  for (const t of openTickets) {
    const days = daysInState(t, now);
    const health = slaHealth(t.state, days, thresholds);
    if (health === "breached") breached += 1;
    else if (health === "approaching") approaching += 1;
  }

  return {
    asOf: now,
    openTicketCount: openTickets.length,
    breachedSlaCount: breached,
    approachingSlaCount: approaching,
    pendingPickupCount: pendingPickup,
    pendingDeliveryCount: pendingDelivery,
    inWarehouseCount: inWarehouse,
    quoteSentCount: quoteSent,
    expiringQuoteCount: expiringQuotes,
    invoiceRequiredCount: invoiceRequired,
    unassignedCount: unassigned,
    duplicateQueueCount: duplicates,
    unscheduledJobCount: unscheduledJobs,
  };
}

/**
 * Render the report as plain text suitable for an email body.
 */
export function renderDigestText(report: DigestReport): string {
  const d = report.asOf.toISOString().slice(0, 10);
  return [
    `BreakFix Triage — daily digest for ${d}`,
    "",
    `Open tickets: ${report.openTicketCount}`,
    `  · ${report.breachedSlaCount} past SLA`,
    `  · ${report.approachingSlaCount} approaching SLA`,
    `  · ${report.unassignedCount} unassigned`,
    "",
    "Queues:",
    `  · Awaiting pickup:      ${report.pendingPickupCount}`,
    `  · In warehouse:         ${report.inWarehouseCount}`,
    `  · Pending delivery:     ${report.pendingDeliveryCount}`,
    `  · Quote sent:           ${report.quoteSentCount} (${report.expiringQuoteCount} past hold window)`,
    `  · Invoice required:     ${report.invoiceRequiredCount}`,
    `  · Duplicate queue:      ${report.duplicateQueueCount}`,
    `  · Unscheduled jobs:     ${report.unscheduledJobCount}`,
    "",
    "Run `npm run quotes:sweep` to auto-expire overdue quotes.",
    "Run `npm run escalate:stale` to push escalations to assignees.",
  ].join("\n");
}

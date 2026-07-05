import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { duplicateQueueCounts } from "@/lib/duplicates/counts";

export const STUCK_IMPORT_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
export const TOKEN_EXPIRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SEVERITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** QA audit BUG-5 — a ticket still in IMPORTED after this long is a
 *  triage-backlog exception in its own right, not just generic aging. */
export const IMPORTED_BACKLOG_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ExceptionCounts {
  failedEmails: number;
  deadJobs: number;
  failedMerges: number;
  /** QA audit BUG-1 — unresolved duplicate-queue items (conflicts +
   *  unlinked synthetics), same definition as the /duplicates page. */
  duplicateQueue: number;
  orphanStopDevices: number;
  stuckImports: number;
  /** Tokens already past their expiry — need immediate reissue. */
  expiredTokens: number;
  /** Tokens still valid but inside the 30-day window. */
  expiringTokens: number;
  /** QA audit BUG-5 — tickets sitting in IMPORTED past the backlog
   *  threshold (triage never started). */
  importedBacklog: number;
  /** Field outcomes: stops failed / partial / completed with proof override. */
  fieldOutcomes: number;
  /** Other high-severity audit events (force changes, tenant rejects, …). */
  severeAudits: number;
  total: number;
}

/**
 * Round-22 §2 — field-outcome audit rows are RouteStop status writes the
 * stop machine flags `warn`: a stop FAILED, a stop saved PARTIAL, or a
 * stop completed past its proof rule with an override. They get their own
 * actionable exception section.
 */
export const FIELD_OUTCOME_WHERE: Prisma.AuditLogWhereInput = {
  entityType: "RouteStop",
  severity: { in: ["warn", "critical"] },
  acknowledgedAt: null,
};

/**
 * Round-16 (D2) — single source of the exception-section
 * definitions, shared by /admin/exceptions and the topbar badge's
 * count endpoint so the badge can never disagree with the page.
 *
 * QA audit (July 2026) changes:
 *   - BUG-1: `duplicateQueue` counts what /duplicates actually lists.
 *   - BUG-2: token expiry is split into `expiredTokens` (already past
 *     expiry, reissue NOW) and `expiringTokens` (valid but inside the
 *     30-day window) — an expired token under an "expiring soon"
 *     heading reads as less urgent than it is.
 *   - BUG-5: `importedBacklog` surfaces tickets stuck in IMPORTED
 *     for 30+ days as their own actionable bucket.
 */
export async function getExceptionCounts(
  db: PrismaClient = defaultPrisma,
): Promise<ExceptionCounts> {
  const now = Date.now();
  const [
    failedEmails,
    deadJobs,
    failedMerges,
    dupQueue,
    orphanStopDevices,
    stuckImports,
    expiredTokens,
    expiringTokens,
    importedBacklog,
    fieldOutcomes,
    severeAudits,
  ] = await Promise.all([
    db.emailLog.count({ where: { status: "failed" } }),
    db.emailJob.count({ where: { status: "failed" } }),
    db.auditLog.count({
      where: {
        action: {
          in: ["snow-merge.failed", "snow-merge.cross-school-collision"],
        },
      },
    }),
    duplicateQueueCounts(db),
    db.stopDevice.count({ where: { ticketId: null, removedAt: null } }),
    db.importBatch.count({
      where: {
        status: { in: ["PENDING", "VALIDATING", "COMMITTING"] },
        createdAt: { lt: new Date(now - STUCK_IMPORT_THRESHOLD_MS) },
      },
    }),
    db.portalToken.count({
      where: {
        revokedAt: null,
        expiresAt: { not: null, lt: new Date(now) },
      },
    }),
    db.portalToken.count({
      where: {
        revokedAt: null,
        expiresAt: {
          not: null,
          gte: new Date(now),
          lt: new Date(now + TOKEN_EXPIRY_WINDOW_MS),
        },
      },
    }),
    db.ticket.count({
      where: {
        state: "IMPORTED",
        stateEnteredAt: {
          lt: new Date(now - IMPORTED_BACKLOG_THRESHOLD_MS),
        },
      },
    }),
    // Field outcomes — no time window: a failed visit stays an open
    // exception until someone acknowledges or resolves it.
    db.auditLog.count({ where: { ...FIELD_OUTCOME_WHERE } }),
    // Other high-severity events, excluding field outcomes (counted
    // above) and anything already acknowledged.
    db.auditLog.count({
      where: {
        severity: { in: ["warn", "critical"] },
        createdAt: { gte: new Date(now - SEVERITY_WINDOW_MS) },
        acknowledgedAt: null,
        entityType: { not: "RouteStop" },
      },
    }),
  ]);

  return {
    failedEmails,
    deadJobs,
    failedMerges,
    duplicateQueue: dupQueue.total,
    orphanStopDevices,
    stuckImports,
    expiredTokens,
    expiringTokens,
    importedBacklog,
    fieldOutcomes,
    severeAudits,
    total:
      failedEmails +
      deadJobs +
      failedMerges +
      dupQueue.total +
      orphanStopDevices +
      stuckImports +
      expiredTokens +
      expiringTokens +
      importedBacklog +
      fieldOutcomes +
      severeAudits,
  };
}

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export const STUCK_IMPORT_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
export const TOKEN_EXPIRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SEVERITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ExceptionCounts {
  failedEmails: number;
  deadJobs: number;
  failedMerges: number;
  orphanStopDevices: number;
  stuckImports: number;
  expiringTokens: number;
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
 */
export async function getExceptionCounts(
  db: PrismaClient = defaultPrisma,
): Promise<ExceptionCounts> {
  const now = Date.now();
  const [
    failedEmails,
    deadJobs,
    failedMerges,
    orphanStopDevices,
    stuckImports,
    expiringTokens,
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
        expiresAt: {
          not: null,
          lt: new Date(now + TOKEN_EXPIRY_WINDOW_MS),
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
    orphanStopDevices,
    stuckImports,
    expiringTokens,
    fieldOutcomes,
    severeAudits,
    total:
      failedEmails +
      deadJobs +
      failedMerges +
      orphanStopDevices +
      stuckImports +
      expiringTokens +
      fieldOutcomes +
      severeAudits,
  };
}

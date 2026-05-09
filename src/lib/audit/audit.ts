import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * Vocabulary for transition-type tagging on audit rows.
 *
 * Closes findings §3.A2 — the value lives on every transition path
 * so reviewers can filter the audit log by "show me all forced
 * transitions in the last week" without parsing the action string.
 *
 *   manual    — an interactive operator action via the UI form.
 *   forced    — admin override via Force change (force: true on
 *               transitionTicket).
 *   kanban    — drag-and-drop on the kanban board (still goes
 *               through transitionTicket but the UI surface is
 *               different — useful for funnel analysis).
 *   scheduled — cron / sweep / job runner (e.g. quote sweep,
 *               escalation digest).
 *   webhook   — inbound integration (ServiceNow, etc.).
 *
 * `system` is implied by `actorUserId === null`; that's the
 * existing convention and is preserved.
 */
export type TransitionType =
  | "manual"
  | "forced"
  | "kanban"
  | "scheduled"
  | "webhook"
  /** Bulk action — multiple rows share a requestId; one summary row
      records the total scope. */
  | "bulk"
  /** Import row reconciliation — Round-13 §1F. */
  | "import"
  /** Idempotent first-run seed write. */
  | "system_seed"
  /** Round-2 §15 / §20 — every email send is its own audit row,
      written by `dispatchEmailEvent`. Distinguishes "operator
      did a thing" from "the email engine reacted to it". */
  | "email_send";

export type AuditSeverity = "info" | "warn" | "critical";

export interface AuditEntry {
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /**
   * Human-readable rationale for the change. Round-13 §1J promotes
   * this to a top-level column; the legacy JSON mirror is kept for
   * a deprecation window so existing render paths don't break.
   */
  reason?: string | null;
  /**
   * One of the TransitionType values. Round-13 §1J promotes this to
   * a top-level column with the JSON mirror retained.
   */
  transitionType?: TransitionType | null;
  /**
   * Round-13 §1J — info | warn | critical. Force changes are warn,
   * cross-tenant rejects are critical, default is info.
   */
  severity?: AuditSeverity | null;
  /**
   * Round-13 §1J — request-scoped correlation id. Bulk actions emit
   * N detail rows + 1 summary row sharing the same requestId so
   * /admin/audit can collapse them. Auto-populated from async-local
   * storage when not supplied.
   */
  requestId?: string | null;
}

/**
 * Append-only audit log. All significant state changes should call this.
 *
 * Round-13 §1J — `reason`, `transitionType`, `requestId`, `severity`
 * are written to dedicated columns. The legacy JSON mirror is kept
 * so existing /admin/audit render paths don't break during the
 * column-promotion deprecation window. ADR 0006 captures the plan.
 */
export async function writeAudit(
  entry: AuditEntry,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<void> {
  let after: Prisma.InputJsonValue | undefined =
    entry.after === null ? undefined : entry.after;
  if (entry.reason != null || entry.transitionType != null) {
    const baseRecord =
      typeof after === "object" &&
      after !== null &&
      !Array.isArray(after)
        ? (after as Record<string, unknown>)
        : after !== undefined
          ? { value: after }
          : {};
    after = {
      ...baseRecord,
      ...(entry.reason != null ? { reason: entry.reason } : {}),
      ...(entry.transitionType != null
        ? { transitionType: entry.transitionType }
        : {}),
    } as Prisma.InputJsonValue;
  }
  await db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? undefined,
      after,
      reason: entry.reason ?? null,
      transitionType: entry.transitionType ?? null,
      severity: entry.severity ?? "info",
      requestId: entry.requestId ?? null,
    },
  });
}

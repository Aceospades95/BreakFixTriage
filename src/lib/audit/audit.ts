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
  | "webhook";

export interface AuditEntry {
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /**
   * Human-readable rationale for the change. Mirrored into
   * `after.reason` so the existing JSON-stored row carries it
   * without a schema migration. See ADR 0006.
   */
  reason?: string | null;
  /**
   * One of the TransitionType values. Mirrored into
   * `after.transitionType`. Optional because not every audit
   * write is a transition — admin CRUD writes don't have one.
   */
  transitionType?: TransitionType | null;
}

/**
 * Append-only audit log. All significant state changes should call this.
 * Intentionally simple: one row per action, no soft-delete semantics.
 *
 * When `reason` and/or `transitionType` are passed, both are mirrored
 * into the `after` JSON so the audit log viewer can render them
 * inline without a schema migration. ADR 0006 plans the move to
 * dedicated columns once approved.
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
    },
  });
}

import { DuplicateResolution, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { emitTransitionSideEffects, transitionTicket } from "@/lib/workflow";

export interface ResolveInput {
  conflictId: string;
  resolution: DuplicateResolution;
  actorUserId: string;
  reason?: string;
}

/**
 * Apply an operator decision to a DuplicateConflict row. Each resolution has
 * a specific side effect; all are recorded in AuditLog.
 *
 * REJECT_NEW / MERGE_INTO_* close the losing ticket with `force: true`:
 * the loser is often freshly IMPORTED (that's when duplicate conflicts
 * are born) and IMPORTED has no CLOSED edge, so the standard graph
 * would reject the whole resolution. Closing a duplicate is a
 * deliberate, permission-gated operator decision with a recorded
 * reason — the same pattern the quote sweep uses for its off-graph
 * transition. The force flag lands in the audit trail (warn severity
 * + payload.forced) so the override stays traceable.
 */
export async function resolveDuplicate(
  input: ResolveInput,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const transitionedTicketIds: string[] = [];
  await db.$transaction(async (tx) => {
    const conflict = await tx.duplicateConflict.findUnique({
      where: { id: input.conflictId },
      include: { leftTicket: true, rightTicket: true },
    });
    if (!conflict) throw new Error(`Conflict ${input.conflictId} not found`);
    if (conflict.resolvedAt)
      throw new Error(`Conflict ${input.conflictId} already resolved`);

    switch (input.resolution) {
      case DuplicateResolution.TREAT_AS_REOPEN: {
        // Walk the left ticket from CLOSED → REOPENED → TRIAGE.
        if (conflict.leftTicket.state === "CLOSED") {
          await transitionTicket(
            conflict.leftTicket.id,
            "REOPENED",
            {
              actorUserId: input.actorUserId,
              reason: input.reason ?? "Reopened via duplicate resolution",
              payload: { conflictId: conflict.id },
            },
            tx,
          );
          await transitionTicket(
            conflict.leftTicket.id,
            "TRIAGE",
            {
              actorUserId: input.actorUserId,
              reason: "Reopen triage",
            },
            tx,
          );
          transitionedTicketIds.push(conflict.leftTicket.id);
        }
        break;
      }
      case DuplicateResolution.REJECT_NEW: {
        // Mark right (the incoming) ticket as CLOSED with a reason.
        if (
          conflict.rightTicket.id !== conflict.leftTicket.id &&
          conflict.rightTicket.state !== "CLOSED"
        ) {
          await transitionTicket(
            conflict.rightTicket.id,
            "CLOSED",
            {
              actorUserId: input.actorUserId,
              reason: input.reason ?? "Rejected as duplicate",
              payload: { invoiceOverride: true, conflictId: conflict.id },
              // Fresh imports sit in IMPORTED, which has no CLOSED
              // edge — see the function docstring.
              force: true,
            },
            tx,
          );
          transitionedTicketIds.push(conflict.rightTicket.id);
        }
        break;
      }
      case DuplicateResolution.MERGE_INTO_LEFT:
      case DuplicateResolution.MERGE_INTO_RIGHT: {
        // Merging is a metadata-level association for now; full row merge
        // is a Phase 2 feature and would need explicit field-by-field rules.
        // We at least move the loser to CLOSED with a pointer payload.
        const loserId =
          input.resolution === DuplicateResolution.MERGE_INTO_LEFT
            ? conflict.rightTicket.id
            : conflict.leftTicket.id;
        const winnerId =
          input.resolution === DuplicateResolution.MERGE_INTO_LEFT
            ? conflict.leftTicket.id
            : conflict.rightTicket.id;
        if (loserId !== winnerId) {
          await transitionTicket(
            loserId,
            "CLOSED",
            {
              actorUserId: input.actorUserId,
              reason: input.reason ?? "Merged as duplicate",
              payload: { mergedInto: winnerId, invoiceOverride: true },
              // The loser can be in any state (often IMPORTED) — see
              // the function docstring.
              force: true,
            },
            tx,
          );
          transitionedTicketIds.push(loserId);
        }
        break;
      }
      case DuplicateResolution.KEEP_BOTH:
        // No-op; operator explicitly chose to treat both as distinct.
        break;
    }

    await tx.duplicateConflict.update({
      where: { id: conflict.id },
      data: {
        resolution: input.resolution,
        resolvedByUserId: input.actorUserId,
        resolvedAt: new Date(),
      },
    });

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "DuplicateConflict",
        entityId: conflict.id,
        action: `resolve:${input.resolution}`,
        before: { resolution: null },
        after: { resolution: input.resolution, reason: input.reason ?? null },
      },
      tx,
    );
  });

  // Post-commit: SSE + notifyOnEnter emails for the tickets moved
  // inside the transaction (a merge-close fires ticket_closed).
  for (const ticketId of transitionedTicketIds) {
    await emitTransitionSideEffects(
      ticketId,
      { actorUserId: input.actorUserId, reason: input.reason },
      db,
    );
  }
}

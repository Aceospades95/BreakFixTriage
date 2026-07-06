import {
  QuoteStatus,
  TicketState,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

/**
 * BUG-3 data repair — find and restore quote approvals the hold
 * sweep wrongly expired before the isApprovalConsumed guard existed.
 *
 * Round-5 QA audit: the first version of this repair matched only
 * rows carrying BOTH an "approve" and a later "auto-expire"
 * QuoteActivity, and only when the ticket currently sat in a fixed
 * list of past-the-gate states. The production row it was built for
 * (INC1000003) matched neither — its activity trail predates those
 * rows and the ticket has since been moved again — so the script
 * found nothing and the corruption survived a "fix confirmed" round.
 *
 * The matcher now works off the TICKET TIMELINE, which is exactly
 * the evidence a human uses to spot the contradiction:
 *
 *   clobbered shape:  a QUOTE_APPROVED event exists, a LATER
 *                     IN_REPAIR event exists (the approval was acted
 *                     on), no QUOTE_NO_RESPONSE event follows the
 *                     approval — yet quote.status = NO_RESPONSE.
 *
 *   legit stall shape (Bug-4b, MUST stay untouched): QUOTE_APPROVED
 *                     followed by QUOTE_NO_RESPONSE — the approval
 *                     was never acted on and the sweep expired it.
 */
export interface ClobberedApproval {
  quoteId: string;
  ticketId: string;
  incidentNumber: string;
  ticketState: TicketState;
}

export async function findClobberedApprovals(
  db: PrismaClient = defaultPrisma,
): Promise<ClobberedApproval[]> {
  const suspects = await db.quote.findMany({
    where: { status: QuoteStatus.NO_RESPONSE },
    select: {
      id: true,
      ticket: {
        select: {
          id: true,
          incidentNumber: true,
          state: true,
          events: {
            where: {
              toState: {
                in: [
                  TicketState.QUOTE_APPROVED,
                  TicketState.IN_REPAIR,
                  TicketState.QUOTE_NO_RESPONSE,
                ],
              },
            },
            orderBy: { createdAt: "asc" },
            select: { toState: true, createdAt: true },
          },
        },
      },
    },
  });

  const out: ClobberedApproval[] = [];
  for (const q of suspects) {
    const events = q.ticket.events;
    const approvedAt = events.find(
      (e) => e.toState === TicketState.QUOTE_APPROVED,
    )?.createdAt;
    if (!approvedAt) continue; // never approved — a genuine no-response
    const actedOn = events.some(
      (e) => e.toState === TicketState.IN_REPAIR && e.createdAt >= approvedAt,
    );
    const expiredAfterApproval = events.some(
      (e) =>
        e.toState === TicketState.QUOTE_NO_RESPONSE &&
        e.createdAt >= approvedAt,
    );
    // Clobbered = the approval was consumed (repair started) and the
    // ticket never legitimately walked to QUOTE_NO_RESPONSE after it.
    if (actedOn && !expiredAfterApproval) {
      out.push({
        quoteId: q.id,
        ticketId: q.ticket.id,
        incidentNumber: q.ticket.incidentNumber,
        ticketState: q.ticket.state,
      });
    }
  }
  return out;
}

/** Restore APPROVED on every clobbered row; each repair is audited. */
export async function repairClobberedApprovals(
  rows: ClobberedApproval[],
  db: PrismaClient = defaultPrisma,
): Promise<number> {
  let repaired = 0;
  for (const row of rows) {
    await db.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id: row.quoteId },
        data: { status: QuoteStatus.APPROVED },
      });
      await tx.quoteActivity.create({
        data: {
          quoteId: row.quoteId,
          kind: "repair",
          actorUserId: null,
          payload: {
            from: QuoteStatus.NO_RESPONSE,
            to: QuoteStatus.APPROVED,
            reason:
              "BUG-3 repair: hold sweep expired an approval the ticket had already consumed",
          },
        },
      });
      await writeAudit(
        {
          actorUserId: null,
          entityType: "Quote",
          entityId: row.quoteId,
          action: "quote.repair:restore-approved",
          before: { status: QuoteStatus.NO_RESPONSE },
          after: { status: QuoteStatus.APPROVED },
          reason: `QA audit BUG-3 — restore approval on ${row.incidentNumber} wrongly expired by the hold sweep (timeline shows Quote approved → In repair)`,
        },
        tx,
      );
    });
    repaired += 1;
  }
  return repaired;
}

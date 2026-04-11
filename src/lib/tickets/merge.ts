/**
 * Ticket merge.
 *
 * Soft merge: the source ticket gets `mergedIntoTicketId = target`
 * and a comment pointing at the target; the target also gets a
 * comment noting the merge. The source's state is moved to CLOSED
 * so it stops showing up in active queues, but its history
 * (events, attachments, comments, time entries, parts usages) is
 * preserved on its own row. The ticket detail page shows a banner
 * on either row that links to the other.
 *
 * This is deliberately less ambitious than "move all data from
 * source to target and delete source": moving rows is easy to get
 * wrong under RLS-style referential integrity, and ops can always
 * look at the source row for the original evidence.
 */

import type { PrismaClient, Ticket } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

export interface MergeTicketInput {
  sourceTicketId: string;
  targetTicketId: string;
  actorUserId: string;
  reason?: string | null;
}

export async function mergeTicket(
  input: MergeTicketInput,
  db: PrismaClient = defaultPrisma,
): Promise<{ source: Ticket; target: Ticket }> {
  if (input.sourceTicketId === input.targetTicketId) {
    throw new Error("Cannot merge a ticket into itself");
  }

  return db.$transaction(async (tx) => {
    const source = await tx.ticket.findUnique({
      where: { id: input.sourceTicketId },
    });
    const target = await tx.ticket.findUnique({
      where: { id: input.targetTicketId },
    });
    if (!source) throw new Error("Source ticket not found");
    if (!target) throw new Error("Target ticket not found");
    if (source.mergedIntoTicketId) {
      throw new Error("Source ticket is already merged");
    }
    if (target.mergedIntoTicketId) {
      throw new Error("Target ticket is already merged into another ticket");
    }

    const now = new Date();
    const updatedSource = await tx.ticket.update({
      where: { id: source.id },
      data: {
        mergedIntoTicketId: target.id,
        state: "CLOSED",
        stateEnteredAt: now,
        closedAt: now,
      },
    });

    const reasonSuffix = input.reason ? `: ${input.reason}` : "";
    await tx.comment.create({
      data: {
        ticketId: source.id,
        authorUserId: input.actorUserId,
        body: `This ticket was merged into ${target.incidentNumber}${reasonSuffix}. See the target for the ongoing record.`,
      },
    });
    await tx.comment.create({
      data: {
        ticketId: target.id,
        authorUserId: input.actorUserId,
        body: `Ticket ${source.incidentNumber} was merged into this one${reasonSuffix}.`,
      },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: source.id,
        fromState: source.state,
        toState: "CLOSED",
        actorUserId: input.actorUserId,
        reason: `Merged into ${target.incidentNumber}`,
        payload: { mergedIntoTicketId: target.id },
      },
    });

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Ticket",
        entityId: source.id,
        action: "merge",
        before: { state: source.state, mergedIntoTicketId: null },
        after: {
          state: "CLOSED",
          mergedIntoTicketId: target.id,
          targetIncident: target.incidentNumber,
        },
      },
      tx,
    );

    return { source: updatedSource, target };
  });
}

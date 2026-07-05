/**
 * QA audit (July 2026), BUG-3 — data repair for approvals the hold
 * sweep wrongly expired.
 *
 * Before the sweep fix (isApprovalConsumed), an APPROVED quote whose
 * ticket had already moved past the quote gate could be flipped to
 * NO_RESPONSE when its hold window lapsed — leaving quote.status
 * contradicting the ticket's own "Quote approved → In repair"
 * timeline (observed on INC1000003).
 *
 * This script finds exactly that shape and restores APPROVED:
 *   - quote.status = NO_RESPONSE
 *   - the quote has an "approve" QuoteActivity (the approval really
 *     happened) followed by an "auto-expire" activity (the sweep is
 *     what flipped it)
 *   - the ticket sits past the quote gate (not in any QUOTE_* state,
 *     not OUT_OF_SCOPE — i.e. the approval was consumed)
 *
 * DRY RUN by default — prints what it would change and exits.
 * Run with --apply to write, e.g.:
 *
 *   npx tsx scripts/repair-consumed-quote-approvals.ts           # inspect
 *   npx tsx scripts/repair-consumed-quote-approvals.ts --apply   # fix
 *
 * Every restoration writes a QuoteActivity (kind "repair") and an
 * AuditLog row, so the correction itself is on the record.
 */
import { PrismaClient, QuoteStatus, TicketState } from "@prisma/client";
import { writeAudit } from "@/lib/audit/audit";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** States that mean "the quote decision is behind this ticket". */
const PAST_QUOTE_GATE: TicketState[] = [
  TicketState.IN_REPAIR,
  TicketState.AWAITING_PARTS,
  TicketState.PARTS_ORDERED,
  TicketState.REPAIR_COMPLETED,
  TicketState.PENDING_DELIVERY,
  TicketState.DELIVERY_SCHEDULED,
  TicketState.RETURNED,
  TicketState.INVOICE_REQUIRED,
  TicketState.CLOSED,
];

async function main() {
  const suspects = await prisma.quote.findMany({
    where: {
      status: QuoteStatus.NO_RESPONSE,
      ticket: { state: { in: PAST_QUOTE_GATE } },
    },
    include: {
      ticket: { select: { incidentNumber: true, state: true } },
      activities: { orderBy: { createdAt: "asc" } },
    },
  });

  const toRepair = suspects.filter((q) => {
    const approveAt = q.activities.find((a) => a.kind === "approve")?.createdAt;
    const expireAt = q.activities.find(
      (a) => a.kind === "auto-expire",
    )?.createdAt;
    // The approval must be real, and the sweep's flip must have come
    // after it. Anything else (e.g. manual status edits) is left for
    // a human.
    return approveAt != null && expireAt != null && expireAt > approveAt;
  });

  console.log(
    `${suspects.length} NO_RESPONSE quote(s) on past-gate tickets; ` +
      `${toRepair.length} match the sweep-clobbered-approval shape.`,
  );

  for (const q of toRepair) {
    console.log(
      `  ${q.ticket.incidentNumber} (${q.ticket.state}) — quote ${q.id}: ` +
        `NO_RESPONSE -> APPROVED${APPLY ? "" : " [dry run]"}`,
    );
    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id: q.id },
        data: { status: QuoteStatus.APPROVED },
      });
      await tx.quoteActivity.create({
        data: {
          quoteId: q.id,
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
          entityId: q.id,
          action: "quote.repair:restore-approved",
          before: { status: QuoteStatus.NO_RESPONSE },
          after: { status: QuoteStatus.APPROVED },
          reason:
            "QA audit BUG-3 — restore approval wrongly expired by the hold sweep (ticket already past the quote gate)",
        },
        tx,
      );
    });
  }

  if (!APPLY && toRepair.length > 0) {
    console.log("\nRe-run with --apply to write these repairs.");
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

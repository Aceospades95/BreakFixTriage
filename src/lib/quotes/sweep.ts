/**
 * Hold-window automation.
 *
 * Every SENT or APPROVED quote may carry a `holdUntil` timestamp.
 * When that timestamp passes without a customer follow-through, the
 * quote should auto-expire to NO_RESPONSE and the owning ticket
 * should move out of QUOTE_SENT / QUOTE_APPROVED into
 * QUOTE_NO_RESPONSE so it re-enters the downstream "no response"
 * queue.
 *
 * SENT  = quote was sent, school never replied within the window.
 * APPROVED = school approved the quote, but the PO / payment side
 *            never landed within the window. Same outcome as SENT
 *            silence — the work is stalled and needs to be re-bucketed.
 *
 * This module exposes three pieces:
 *
 *   1. `isQuoteExpired` — a pure predicate used by tests and by the
 *      sweeper to decide whether a specific quote is overdue.
 *   2. `sweepExpiredQuotes` — runs the predicate against every
 *      SENT / APPROVED quote in the DB and applies the side effects
 *      inside a single transaction per quote.
 *   3. A small report shape so the caller (either a cron script or the
 *      "Run sweep now" button on the quotes page) can report what was
 *      done.
 *
 * See `docs/proposed-issues.md` Q1 for the deferred decision on
 * whether APPROVED-with-expired-hold should land in a dedicated
 * QUOTE_EXPIRED state instead of NO_RESPONSE.
 */

import {
  QuoteStatus,
  TicketState,
  type PrismaClient,
  type Quote,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";
import {
  enqueueNotification,
  renderQuoteNoResponse,
} from "@/lib/notifications";

/**
 * Pure predicate. A quote is considered expired iff:
 *   - it is in SENT or APPROVED status, AND
 *   - it has a holdUntil, AND
 *   - that holdUntil is <= the reference time.
 *
 * Quotes without a holdUntil never expire automatically. Quotes in
 * DRAFT, DECLINED, NO_RESPONSE, or CANCELLED never expire — they are
 * already in a terminal-for-this-flow state.
 */
export function isQuoteExpired(
  quote: Pick<Quote, "status" | "holdUntil">,
  now: Date,
): boolean {
  if (
    quote.status !== QuoteStatus.SENT &&
    quote.status !== QuoteStatus.APPROVED
  ) {
    return false;
  }
  if (!quote.holdUntil) return false;
  return quote.holdUntil.getTime() <= now.getTime();
}

export interface SweepReport {
  scanned: number;
  expired: number;
  ticketsMoved: number;
  errors: { quoteId: string; message: string }[];
}

export interface SweepInput {
  /** Defaults to system actor (null) when not supplied. */
  actorUserId?: string | null;
  /** Override the clock for tests or scripted backfills. */
  now?: Date;
}

/**
 * Sweep all SENT and APPROVED quotes whose holdUntil has passed,
 * flipping them to NO_RESPONSE and pushing the corresponding ticket
 * to QUOTE_NO_RESPONSE. Each quote is handled in its own transaction
 * so a single failing quote doesn't block the rest of the batch.
 */
export async function sweepExpiredQuotes(
  input: SweepInput = {},
  db: PrismaClient = defaultPrisma,
): Promise<SweepReport> {
  const now = input.now ?? new Date();
  const actorUserId = input.actorUserId ?? null;

  const candidates = await db.quote.findMany({
    where: {
      status: { in: [QuoteStatus.SENT, QuoteStatus.APPROVED] },
      holdUntil: { lte: now },
    },
    include: {
      ticket: {
        include: {
          school: { include: { mainContact: true } },
        },
      },
    },
  });

  const report: SweepReport = {
    scanned: candidates.length,
    expired: 0,
    ticketsMoved: 0,
    errors: [],
  };

  for (const quote of candidates) {
    const priorStatus = quote.status;
    try {
      await db.$transaction(async (tx) => {
        await tx.quote.update({
          where: { id: quote.id },
          data: {
            status: QuoteStatus.NO_RESPONSE,
            respondedAt: now,
          },
        });
        await tx.quoteActivity.create({
          data: {
            quoteId: quote.id,
            kind: "auto-expire",
            actorUserId,
            payload: {
              priorStatus,
              holdUntil: quote.holdUntil?.toISOString() ?? null,
              sweptAt: now.toISOString(),
            },
          },
        });
        await writeAudit(
          {
            actorUserId,
            entityType: "Quote",
            entityId: quote.id,
            action: "auto-expire",
            before: { status: priorStatus },
            after: { status: QuoteStatus.NO_RESPONSE },
          },
          tx,
        );
        report.expired += 1;

        // Move the ticket out of QUOTE_SENT or QUOTE_APPROVED into
        // QUOTE_NO_RESPONSE. Force the transition because the
        // QUOTE_APPROVED → QUOTE_NO_RESPONSE edge is not in the
        // standard graph (an admin would have manually moved it
        // forward) — the sweep needs to be able to do this without
        // an admin in the loop. The audit row above plus the
        // payload.sweep flag below makes the override traceable.
        if (
          quote.ticket.state === TicketState.QUOTE_SENT ||
          quote.ticket.state === TicketState.QUOTE_APPROVED
        ) {
          const fromState = quote.ticket.state;
          try {
            await transitionTicket(
              quote.ticketId,
              TicketState.QUOTE_NO_RESPONSE,
              {
                actorUserId,
                reason: `Auto-expired after hold window (${quote.holdUntil?.toISOString() ?? "unknown"})`,
                payload: { quoteId: quote.id, sweep: true, fromState },
                force: fromState === TicketState.QUOTE_APPROVED,
              },
              tx,
            );
            report.ticketsMoved += 1;
          } catch (err) {
            await writeAudit(
              {
                actorUserId,
                entityType: "Ticket",
                entityId: quote.ticketId,
                action: "auto-expire:ticket-skip",
                after: {
                  reason: err instanceof Error ? err.message : String(err),
                  quoteId: quote.id,
                },
              },
              tx,
            );
          }
        }

        // Queue a follow-up email to the school's primary contact.
        const contact = quote.ticket.school.mainContact;
        if (contact?.email && contact.email.includes("@")) {
          const rendered = renderQuoteNoResponse({
            incidentNumber: quote.ticket.incidentNumber,
            schoolName: quote.ticket.school.name,
            holdUntil: quote.holdUntil,
          });
          try {
            await enqueueNotification(
              {
                kind: "NO_RESPONSE_CLOSURE",
                ticketId: quote.ticketId,
                quoteId: quote.id,
                recipientEmail: contact.email,
                subject: rendered.subject,
                body: rendered.body,
              },
              tx,
            );
          } catch (err) {
            await writeAudit(
              {
                actorUserId,
                entityType: "Quote",
                entityId: quote.id,
                action: "auto-expire:notify-skip",
                after: {
                  reason: err instanceof Error ? err.message : String(err),
                },
              },
              tx,
            );
          }
        }
      });
    } catch (err) {
      report.errors.push({
        quoteId: quote.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}

/**
 * Hold-window automation.
 *
 * Every SENT quote carries a `holdUntil` timestamp. When that timestamp
 * passes without a customer response, the quote should auto-expire to
 * NO_RESPONSE and the owning ticket should move from QUOTE_SENT to
 * QUOTE_NO_RESPONSE so it re-enters the downstream "no response" queue.
 *
 * This module exposes three pieces:
 *
 *   1. `isQuoteExpired` — a pure predicate used by tests and by the
 *      sweeper to decide whether a specific quote is overdue.
 *   2. `sweepExpiredQuotes` — runs the predicate against every SENT
 *      quote in the DB and applies the side effects inside a single
 *      transaction per quote.
 *   3. A small report shape so the caller (either a cron script or the
 *      "Run sweep now" button on the quotes page) can report what was
 *      done.
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

/**
 * Pure predicate. A quote is considered expired iff it is still SENT,
 * has a holdUntil, and that holdUntil is <= the reference time.
 * Quotes without a holdUntil never expire automatically.
 */
export function isQuoteExpired(
  quote: Pick<Quote, "status" | "holdUntil">,
  now: Date,
): boolean {
  if (quote.status !== QuoteStatus.SENT) return false;
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
 * Sweep all SENT quotes whose holdUntil has passed, flipping them to
 * NO_RESPONSE and pushing the corresponding ticket to
 * QUOTE_NO_RESPONSE. Each quote is handled in its own transaction so a
 * single failing quote doesn't block the rest of the batch.
 */
export async function sweepExpiredQuotes(
  input: SweepInput = {},
  db: PrismaClient = defaultPrisma,
): Promise<SweepReport> {
  const now = input.now ?? new Date();
  const actorUserId = input.actorUserId ?? null;

  const candidates = await db.quote.findMany({
    where: {
      status: QuoteStatus.SENT,
      holdUntil: { lte: now },
    },
    include: { ticket: true },
  });

  const report: SweepReport = {
    scanned: candidates.length,
    expired: 0,
    ticketsMoved: 0,
    errors: [],
  };

  for (const quote of candidates) {
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
            before: { status: QuoteStatus.SENT },
            after: { status: QuoteStatus.NO_RESPONSE },
          },
          tx,
        );
        report.expired += 1;

        if (quote.ticket.state === TicketState.QUOTE_SENT) {
          try {
            await transitionTicket(
              quote.ticketId,
              TicketState.QUOTE_NO_RESPONSE,
              {
                actorUserId,
                reason: `Auto-expired after hold window (${quote.holdUntil?.toISOString() ?? "unknown"})`,
                payload: { quoteId: quote.id, sweep: true },
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

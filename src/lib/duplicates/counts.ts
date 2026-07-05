import { TicketState, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * QA audit (July 2026), BUG-1 — the single source of truth for "how
 * many items are sitting in the duplicate queue".
 *
 * The /duplicates page lists TWO kinds of work item:
 *   1. unresolved DuplicateConflict rows (importer-flagged pairs), and
 *   2. synthetic on-route tickets still in PENDING_PICKUP_UNLINKED
 *      (created at a stop, never reconciled with a SNOW INC).
 *
 * The dashboard tile counted only (1) and the exceptions monitor
 * counted merge-FAILURE audit rows — so a 58-day-old unlinked
 * synthetic sat in the queue while both surfaces read 0. Every
 * consumer (dashboard tile, digest, exceptions page + topbar badge)
 * now derives from this function, whose where-clauses must stay
 * identical to the /duplicates page queries.
 */
export interface DuplicateQueueCounts {
  unresolvedConflicts: number;
  unlinkedSynthetics: number;
  total: number;
}

export async function duplicateQueueCounts(
  db: PrismaClient = defaultPrisma,
): Promise<DuplicateQueueCounts> {
  const [unresolvedConflicts, unlinkedSynthetics] = await Promise.all([
    db.duplicateConflict.count({ where: { resolvedAt: null } }),
    db.ticket.count({
      where: { state: TicketState.PENDING_PICKUP_UNLINKED },
    }),
  ]);
  return {
    unresolvedConflicts,
    unlinkedSynthetics,
    total: unresolvedConflicts + unlinkedSynthetics,
  };
}

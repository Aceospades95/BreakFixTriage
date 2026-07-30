import { TicketState, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { andTicketWhere } from "@/lib/data/forSession";

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
  /**
   * Ticket scope (tenant, and optionally borough). The /duplicates
   * page is scoped per ADR 0014 but this counter was not, so a
   * district user's dashboard tile read the citywide number and then
   * the page it linked to showed a much smaller list. A conflict is
   * in scope when EITHER side is — the same rule the page uses, and
   * the two must not drift apart.
   *
   * Defaults to `{}` so admin surfaces (exceptions, topbar badge) are
   * unchanged.
   */
  scope: Prisma.TicketWhereInput = {},
): Promise<DuplicateQueueCounts> {
  const scoped = Object.keys(scope).length > 0;
  const [unresolvedConflicts, unlinkedSynthetics] = await Promise.all([
    db.duplicateConflict.count({
      where: {
        resolvedAt: null,
        ...(scoped
          ? { OR: [{ leftTicket: scope }, { rightTicket: scope }] }
          : {}),
      },
    }),
    db.ticket.count({
      where: andTicketWhere(scope, {
        state: TicketState.PENDING_PICKUP_UNLINKED,
      }),
    }),
  ]);
  return {
    unresolvedConflicts,
    unlinkedSynthetics,
    total: unresolvedConflicts + unlinkedSynthetics,
  };
}

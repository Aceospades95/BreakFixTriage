import type { Prisma, TicketState } from "@prisma/client";

/**
 * Prisma where-clause for "SLA breached": whole days in the current
 * state have reached that state's threshold. daysInState >= T ⇔
 * stateEnteredAt <= now - T days (stateEnteredAt is non-null with a
 * DB default). Mirrors lib/reports/sla.ts::slaHealth so the list
 * filter, the CSV export, and the home-page attention queue all
 * agree on what "breached" means.
 *
 * States with a null threshold (terminal / hold) are excluded — they
 * carry no SLA burden, matching the badge's "n/a" bucket.
 */
export function slaBreachedWhere(
  thresholds: Record<TicketState, number | null>,
  now: Date = new Date(),
): Prisma.TicketWhereInput {
  const perState = (
    Object.entries(thresholds) as [TicketState, number | null][]
  )
    .filter(([, t]) => t != null)
    .map(
      ([state, t]) =>
        ({
          state,
          stateEnteredAt: {
            lte: new Date(now.getTime() - t! * 24 * 60 * 60 * 1000),
          },
        }) satisfies Prisma.TicketWhereInput,
    );
  return { OR: perState };
}

import type { Prisma, TicketState } from "@prisma/client";

/** States where a school is waiting on a visit from us. */
export const WAITING_ON_VISIT_STATES: TicketState[] = [
  "AWAITING_PICKUP",
  "PICKUP_SCHEDULED",
  "PENDING_DELIVERY",
  "DELIVERY_SCHEDULED",
  "AWAITING_ONSITE",
];

/**
 * Round-22 (demo decision) — "Delayed" for the school portal: tickets
 * still waiting on a visit whose stop was FAILED (school closed, SPOC
 * not there…), CANCELLED (route cancelled), or is running late right
 * now (an active reported delay). Once the visit succeeds and the
 * ticket moves on, it drops out of this bucket.
 */
export function delayedTicketWhere(
  schoolId: string,
): Prisma.TicketWhereInput {
  const stopTrouble: Prisma.RouteStopWhereInput = {
    OR: [
      { status: { in: ["FAILED", "CANCELLED"] } },
      {
        delayedAt: { not: null },
        status: { notIn: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] },
      },
    ],
  };
  return {
    schoolId,
    state: { in: WAITING_ON_VISIT_STATES },
    OR: [
      { jobLinks: { some: { job: { routeStops: { some: stopTrouble } } } } },
      { stopDevices: { some: { removedAt: null, stop: stopTrouble } } },
    ],
  };
}

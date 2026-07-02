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
 *
 * Trouble only counts against the KIND of visit the ticket is
 * currently waiting on: a pickup that failed in May must not re-flag
 * the same ticket as Delayed in June while it waits on its delivery —
 * that stop's failure was resolved by the successful re-pickup.
 * Pickup-phase states match PICKUP jobs (or pickup-purpose stop
 * lines), delivery-phase states match DELIVERY jobs (or
 * delivery-purpose lines), and AWAITING_ONSITE matches on-site jobs.
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

  const phase = (
    states: TicketState[],
    jobType: "PICKUP" | "DELIVERY" | "ONSITE_REPAIR",
    linePurpose: "PICKUP" | "DELIVERY" | null,
  ): Prisma.TicketWhereInput => ({
    state: { in: states },
    OR: [
      {
        jobLinks: {
          some: {
            job: { type: jobType, routeStops: { some: stopTrouble } },
          },
        },
      },
      {
        stopDevices: {
          some: {
            removedAt: null,
            ...(linePurpose ? { purpose: linePurpose } : {}),
            stop: linePurpose
              ? stopTrouble
              : { AND: [stopTrouble, { job: { type: jobType } }] },
          },
        },
      },
    ],
  });

  return {
    schoolId,
    OR: [
      phase(["AWAITING_PICKUP", "PICKUP_SCHEDULED"], "PICKUP", "PICKUP"),
      phase(
        ["PENDING_DELIVERY", "DELIVERY_SCHEDULED"],
        "DELIVERY",
        "DELIVERY",
      ),
      phase(["AWAITING_ONSITE"], "ONSITE_REPAIR", null),
    ],
  };
}

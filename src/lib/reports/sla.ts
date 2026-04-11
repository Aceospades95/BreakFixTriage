/**
 * SLA helpers.
 *
 * Every state on the ticket lifecycle has an "allowed dwell time" — if
 * a ticket sits there longer than that, it's a problem. This module
 * provides a default threshold table, a pure `daysInState` calculator,
 * and a three-bucket health classifier (on_track / approaching /
 * breached).
 *
 * The thresholds are defaults, not gospel. A later phase should make
 * them editable in an admin UI and scoped per-district. For now they
 * match what the legacy spreadsheet team said made sense.
 *
 * Terminal / hold states have a `null` threshold which the
 * classifier returns as `n/a` — no SLA burden on closed work.
 */

import type { TicketState } from "@prisma/client";

/**
 * Days-in-state thresholds. Tuned to match what a break-fix shop
 * considers reasonable turnaround in each phase of the workflow.
 * Replace with a DB-backed config table whenever ops gets tired of
 * code changes.
 */
export const DEFAULT_SLA_DAYS: Record<TicketState, number | null> = {
  IMPORTED: 1,
  TRIAGE: 2,
  AWAITING_PICKUP: 3,
  PICKUP_SCHEDULED: 1,
  IN_WAREHOUSE: 1,
  DIAGNOSIS: 3,
  AWAITING_PARTS: 10,
  PARTS_ORDERED: 14,
  IN_REPAIR: 5,
  REPAIR_COMPLETED: 2,
  AWAITING_ONSITE: 3,
  ONSITE_IN_PROGRESS: 1,
  QUOTE_REQUIRED: 2,
  QUOTE_SENT: 7,
  QUOTE_APPROVED: 2,
  QUOTE_DECLINED: null,
  QUOTE_NO_RESPONSE: null,
  MANUFACTURER_RMA: 30,
  OUT_OF_SCOPE: 2,
  PENDING_DELIVERY: 3,
  DELIVERY_SCHEDULED: 1,
  RETURNED: 2,
  INVOICE_REQUIRED: 7,
  CLOSED: null,
  REOPENED: 1,
  ON_HOLD: null,
};

export type SlaHealth = "on_track" | "approaching" | "breached" | "na";

/**
 * Ticket subset the helpers need. Callers pass a plain object with
 * just these fields so the functions stay easy to test without a DB.
 */
export interface SlaTicketSubset {
  state: TicketState;
  stateEnteredAt: Date | null;
  reportedAt: Date;
}

/**
 * Milliseconds in a day. Kept explicit to avoid the magic-number
 * problem when reading call sites.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many whole days the ticket has been in its current state. Uses
 * `stateEnteredAt` when present, falling back to `reportedAt` for
 * tickets that haven't transitioned yet.
 */
export function daysInState(ticket: SlaTicketSubset, now: Date): number {
  const anchor = ticket.stateEnteredAt ?? ticket.reportedAt;
  const diffMs = now.getTime() - anchor.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * Health classifier for an individual ticket. The `approaching`
 * bucket fires at 75% of the threshold so dispatchers get warned
 * *before* they miss the SLA, not after.
 */
export function slaHealth(
  state: TicketState,
  daysInCurrentState: number,
  thresholds: Record<TicketState, number | null> = DEFAULT_SLA_DAYS,
): SlaHealth {
  const threshold = thresholds[state];
  if (threshold == null) return "na";
  if (daysInCurrentState >= threshold) return "breached";
  // Approaching kicks in at 75% of the threshold, but never below 1 day
  // so very tight thresholds (1 day) still have a clean "on_track"
  // bucket while fresh.
  const approachingAt = Math.max(1, Math.floor(threshold * 0.75));
  if (daysInCurrentState >= approachingAt) return "approaching";
  return "on_track";
}

/**
 * Short user-facing label for the health buckets, e.g. for use on a
 * badge or tooltip. Kept separate from the classifier so the same
 * logic can drive different visuals.
 */
export function slaLabel(
  health: SlaHealth,
  daysInCurrentState: number,
  state: TicketState,
  thresholds: Record<TicketState, number | null> = DEFAULT_SLA_DAYS,
): string {
  if (health === "na") return "—";
  const threshold = thresholds[state];
  return `${daysInCurrentState}d / ${threshold}d`;
}

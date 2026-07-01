import { TicketState } from "@prisma/client";

/**
 * Allowed transitions for the ticket lifecycle state machine.
 *
 * Source of truth. Keep in sync with docs/DOMAIN.md. Tests in
 * tests/state-machine.test.ts enforce that every state either appears as a
 * terminal state or has an outgoing edge.
 */
export const ALLOWED_TRANSITIONS: Record<TicketState, readonly TicketState[]> = {
  // Round-22 (demo) — IN_WAREHOUSE is reachable straight from IMPORTED
  // and AWAITING_PICKUP: the migration-intake flow scans freshly
  // imported devices at the warehouse door, and devices sometimes
  // arrive without a scheduled route. Physically-in-hand beats the
  // paperwork order.
  IMPORTED: ["TRIAGE", "IN_WAREHOUSE", "ON_HOLD"],
  TRIAGE: [
    "AWAITING_PICKUP",
    "AWAITING_ONSITE",
    "OUT_OF_SCOPE",
    "CLOSED",
    "ON_HOLD",
  ],
  AWAITING_PICKUP: [
    "PICKUP_SCHEDULED",
    "IN_WAREHOUSE",
    "ON_HOLD",
    "OUT_OF_SCOPE",
  ],
  PICKUP_SCHEDULED: ["IN_WAREHOUSE", "AWAITING_PICKUP", "ON_HOLD"],
  IN_WAREHOUSE: ["DIAGNOSIS", "ON_HOLD"],
  DIAGNOSIS: [
    "IN_REPAIR",
    "AWAITING_PARTS",
    "QUOTE_REQUIRED",
    "MANUFACTURER_RMA",
    "OUT_OF_SCOPE",
    "ON_HOLD",
  ],
  AWAITING_PARTS: ["PARTS_ORDERED", "OUT_OF_SCOPE", "ON_HOLD"],
  PARTS_ORDERED: ["IN_REPAIR", "AWAITING_PARTS", "ON_HOLD"],
  IN_REPAIR: [
    "REPAIR_COMPLETED",
    "AWAITING_PARTS",
    "QUOTE_REQUIRED",
    "ON_HOLD",
  ],
  REPAIR_COMPLETED: [
    "PENDING_DELIVERY",
    // Reversions: sometimes QA finds an issue after "completed" is
    // clicked, or the tech changes their mind. Let them go back
    // without needing an admin force.
    "IN_REPAIR",
    "DIAGNOSIS",
    "ON_HOLD",
  ],
  AWAITING_ONSITE: ["ONSITE_IN_PROGRESS", "ON_HOLD"],
  ONSITE_IN_PROGRESS: [
    "REPAIR_COMPLETED",
    "AWAITING_PARTS",
    "QUOTE_REQUIRED",
    "CLOSED",
    "ON_HOLD",
  ],
  QUOTE_REQUIRED: ["QUOTE_SENT", "OUT_OF_SCOPE", "ON_HOLD"],
  QUOTE_SENT: [
    "QUOTE_APPROVED",
    "QUOTE_DECLINED",
    "QUOTE_NO_RESPONSE",
    "ON_HOLD",
  ],
  QUOTE_APPROVED: ["IN_REPAIR", "ON_HOLD"],
  QUOTE_DECLINED: ["PENDING_DELIVERY", "OUT_OF_SCOPE"],
  QUOTE_NO_RESPONSE: ["PENDING_DELIVERY", "OUT_OF_SCOPE"],
  MANUFACTURER_RMA: ["PENDING_DELIVERY", "CLOSED", "ON_HOLD"],
  OUT_OF_SCOPE: ["PENDING_DELIVERY", "CLOSED"],
  PENDING_DELIVERY: [
    "DELIVERY_SCHEDULED",
    // Escape hatches — if a ticket lands here by mistake or a late
    // failure is discovered, allow walking back into the repair
    // lifecycle instead of being trapped waiting for a route.
    "REPAIR_COMPLETED",
    "IN_REPAIR",
    "DIAGNOSIS",
    "OUT_OF_SCOPE",
    "ON_HOLD",
  ],
  DELIVERY_SCHEDULED: [
    "RETURNED",
    "PENDING_DELIVERY",
    "REPAIR_COMPLETED",
    "ON_HOLD",
  ],
  RETURNED: ["INVOICE_REQUIRED", "CLOSED", "REPAIR_COMPLETED"],
  INVOICE_REQUIRED: ["CLOSED", "RETURNED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["TRIAGE"],
  // ON_HOLD returns via the workflow engine by reading TicketEvent.payload.
  // At the type level, any non-terminal state is reachable.
  ON_HOLD: [
    "TRIAGE",
    "AWAITING_PICKUP",
    "PICKUP_SCHEDULED",
    "IN_WAREHOUSE",
    "DIAGNOSIS",
    "AWAITING_PARTS",
    "PARTS_ORDERED",
    "IN_REPAIR",
    "REPAIR_COMPLETED",
    "AWAITING_ONSITE",
    "ONSITE_IN_PROGRESS",
    "QUOTE_REQUIRED",
    "QUOTE_SENT",
    "MANUFACTURER_RMA",
    "PENDING_DELIVERY",
    "DELIVERY_SCHEDULED",
  ],
  // Round-4 §N1: synthetic state for on-route pickups that haven't
  // been reconciled with an SNOW ticket yet. The SNOW reconciler
  // proposes a merge in /duplicates rather than transitioning out
  // here directly. Manual exits are limited to lanes that make
  // sense for an unmatched device:
  //   - TRIAGE: operator decides this is an in-house ticket.
  //   - IN_WAREHOUSE: device went straight to the bench.
  //   - OUT_OF_SCOPE: device shouldn't have been picked up.
  //   - CLOSED: false-alarm pickup; close out without further work.
  PENDING_PICKUP_UNLINKED: [
    "TRIAGE",
    "IN_WAREHOUSE",
    "OUT_OF_SCOPE",
    "CLOSED",
  ],
};

export const TERMINAL_STATES: readonly TicketState[] = ["CLOSED"];

export function isTerminal(state: TicketState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function canTransition(from: TicketState, to: TicketState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNextStates(from: TicketState): readonly TicketState[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

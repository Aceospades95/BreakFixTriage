import type { TicketState } from "@prisma/client";

/**
 * Round-18 §2 — operator guidance per ticket state.
 *
 * Field feedback: "the ticket says Awaiting pickup… now what?" The
 * state machine knows the legal edges but never told the operator
 * which one is the *happy path* or where the work actually happens
 * (scheduling, quotes, the bench). One entry per state: a headline,
 * a sentence of what to do, and optionally where to go do it.
 */

export interface NextAction {
  headline: string;
  body: string;
  cta?: { label: string; href: string };
}

export const NEXT_ACTION: Record<TicketState, NextAction> = {
  IMPORTED: {
    headline: "Triage this ticket",
    body: "Fresh from import. Review the description, set a priority, and move it to Triage to start the workflow.",
  },
  TRIAGE: {
    headline: "Pick the path",
    body: "Decide how this gets fixed: send it to Awaiting pickup for a warehouse repair, Awaiting onsite for a field visit, or close it out if it's out of scope.",
  },
  AWAITING_PICKUP: {
    headline: "Ready for pickup — schedule it",
    body: "This ticket is waiting to be put on a pickup route. It appears in the ready-to-schedule groups; adding it to a route moves it to Pickup scheduled automatically.",
    cta: { label: "Open Scheduling", href: "/scheduling" },
  },
  PICKUP_SCHEDULED: {
    headline: "On a route — nothing to do here",
    body: "A pickup route covers this ticket. When the driver completes the stop, the ticket moves to In warehouse on its own.",
    cta: { label: "View routes", href: "/scheduling" },
  },
  IN_WAREHOUSE: {
    headline: "Start the diagnosis",
    body: "The device is on the bench. Move the ticket to Diagnosis when a technician starts looking at it.",
    cta: { label: "Open Bench", href: "/bench" },
  },
  DIAGNOSIS: {
    headline: "Decide the repair path",
    body: "Out of diagnosis a ticket goes to In repair, waits on parts, needs a quote for billable work, or goes back via manufacturer RMA.",
  },
  AWAITING_PARTS: {
    headline: "Order the parts",
    body: "Mark it Parts ordered once the order is placed so the stale-ticket sweep knows it's moving.",
  },
  PARTS_ORDERED: {
    headline: "Waiting on delivery",
    body: "When the parts arrive, move the ticket back to In repair to continue the fix.",
  },
  IN_REPAIR: {
    headline: "Finish the repair",
    body: "Mark it Repair completed when the work is done — that queues it for the delivery leg.",
  },
  REPAIR_COMPLETED: {
    headline: "Ready to go back — queue the delivery",
    body: "Move it to Pending delivery so it shows up in the ready-to-schedule delivery groups.",
  },
  AWAITING_ONSITE: {
    headline: "Plan the onsite visit",
    body: "Move it to Onsite in progress when the technician is at the school.",
    cta: { label: "Open Scheduling", href: "/scheduling" },
  },
  ONSITE_IN_PROGRESS: {
    headline: "Wrap up the visit",
    body: "Finish as Repair completed, or branch to parts / quote if the fix can't happen on site.",
  },
  QUOTE_REQUIRED: {
    headline: "Create and send the quote",
    body: "This repair is billable. Draft the quote and mark the ticket Quote sent once it goes out.",
    cta: { label: "Open Quotes", href: "/quotes" },
  },
  QUOTE_SENT: {
    headline: "Waiting on the school",
    body: "Record the school's answer: approved, declined, or no response. The quote sweep nudges silent ones automatically.",
    cta: { label: "Open Quotes", href: "/quotes" },
  },
  QUOTE_APPROVED: {
    headline: "Approved — start the repair",
    body: "The school accepted the quote. Move the ticket to In repair.",
  },
  QUOTE_DECLINED: {
    headline: "Declined — send the device back",
    body: "Queue it for Pending delivery to return the device unrepaired, or mark it out of scope.",
  },
  QUOTE_NO_RESPONSE: {
    headline: "No answer — decide the exit",
    body: "The school never responded. Return the device via Pending delivery or mark it out of scope.",
  },
  MANUFACTURER_RMA: {
    headline: "Waiting on the manufacturer",
    body: "When the replacement or repair comes back, queue it for Pending delivery (or close it directly).",
  },
  OUT_OF_SCOPE: {
    headline: "Out of scope — return or close",
    body: "If the school still has to get the device back, queue Pending delivery; otherwise close the ticket.",
  },
  PENDING_DELIVERY: {
    headline: "Ready for delivery — schedule it",
    body: "This ticket is waiting to be put on a delivery route. Adding it to a route moves it to Delivery scheduled automatically.",
    cta: { label: "Open Scheduling", href: "/scheduling" },
  },
  DELIVERY_SCHEDULED: {
    headline: "On a delivery route",
    body: "When the driver completes the stop, the ticket records the return on its own.",
    cta: { label: "View routes", href: "/scheduling" },
  },
  RETURNED: {
    headline: "Delivered — close it out",
    body: "Close the ticket, or move it to Invoice required first if this repair gets billed.",
  },
  INVOICE_REQUIRED: {
    headline: "Send the invoice",
    body: "Generate the invoice, then close the ticket.",
    cta: { label: "Open Invoices", href: "/invoices" },
  },
  CLOSED: {
    headline: "All done",
    body: "This ticket is closed. Reopen it only if the same issue comes back on the same device.",
  },
  REOPENED: {
    headline: "Back for another round",
    body: "Re-triage the ticket to restart the workflow.",
  },
  ON_HOLD: {
    headline: "Parked — resume when unblocked",
    body: "Pick the state it should return to once whatever paused it is resolved.",
  },
  PENDING_PICKUP_UNLINKED: {
    headline: "Link this pickup to its incident",
    body: "A driver collected this device on a route before the SNOW incident posted. Match it on the Duplicates page, or triage it as an in-house ticket.",
    cta: { label: "Open Duplicates", href: "/duplicates" },
  },
};

export function nextActionFor(state: TicketState): NextAction {
  return NEXT_ACTION[state];
}

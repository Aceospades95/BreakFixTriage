/**
 * Notification templates. Pure functions: given a small set of
 * structured inputs, return a `{subject, body}` pair. No database, no
 * transports, no side effects — easy to test and easy to swap for
 * richer templating later.
 *
 * All templates are plain-text so they work across SMTP, stdout, and
 * any future webhook transport without needing HTML rendering.
 */

import type { NotificationKind } from "@prisma/client";

export interface RenderedNotification {
  subject: string;
  body: string;
}

export interface QuoteSentVars {
  incidentNumber: string;
  schoolName: string;
  amountDollars: number | null;
  diagnosticOnly: boolean;
  holdUntil: Date | null;
  requesterName: string | null;
}

export function renderQuoteSent(vars: QuoteSentVars): RenderedNotification {
  const amountLine = vars.diagnosticOnly
    ? "This is a diagnostic quote — no repair charge is included."
    : vars.amountDollars != null
      ? `Estimated cost: $${vars.amountDollars.toFixed(2)}`
      : "Estimated cost: to be confirmed";
  const holdLine = vars.holdUntil
    ? `Please respond by ${vars.holdUntil.toISOString().slice(0, 10)}. Quotes that are not answered by that date are closed automatically.`
    : "Please respond at your earliest convenience.";
  const greeting = vars.requesterName ? `Hi ${vars.requesterName},` : "Hello,";
  return {
    subject: `[${vars.incidentNumber}] Repair quote ready for your approval`,
    body: [
      greeting,
      "",
      `We have prepared a repair quote for incident ${vars.incidentNumber} at ${vars.schoolName}.`,
      "",
      amountLine,
      "",
      holdLine,
      "",
      "— BreakFix Triage",
    ].join("\n"),
  };
}

export interface DeliveryScheduledVars {
  incidentNumber: string;
  schoolName: string;
  deliveryDate: Date;
  contactName: string | null;
}

export function renderDeliveryScheduled(
  vars: DeliveryScheduledVars,
): RenderedNotification {
  const greeting = vars.contactName ? `Hi ${vars.contactName},` : "Hello,";
  return {
    subject: `[${vars.incidentNumber}] Device delivery scheduled`,
    body: [
      greeting,
      "",
      `A technician is scheduled to return the repaired device for incident ${vars.incidentNumber} to ${vars.schoolName} on ${vars.deliveryDate.toISOString().slice(0, 10)}.`,
      "",
      "Please make sure a point of contact is available at the school to receive the delivery and sign off on the work.",
      "",
      "— BreakFix Triage",
    ].join("\n"),
  };
}

export interface PickupScheduledVars {
  incidentNumber: string;
  schoolName: string;
  pickupDate: Date;
  contactName: string | null;
}

export function renderPickupScheduled(
  vars: PickupScheduledVars,
): RenderedNotification {
  const greeting = vars.contactName ? `Hi ${vars.contactName},` : "Hello,";
  return {
    subject: `[${vars.incidentNumber}] Device pickup scheduled`,
    body: [
      greeting,
      "",
      `A technician is scheduled to pick up the device for incident ${vars.incidentNumber} from ${vars.schoolName} on ${vars.pickupDate.toISOString().slice(0, 10)}.`,
      "",
      "Please have the device ready at the front office or main contact location.",
      "",
      "— BreakFix Triage",
    ].join("\n"),
  };
}

export interface QuoteNoResponseVars {
  incidentNumber: string;
  schoolName: string;
  holdUntil: Date | null;
}

export function renderQuoteNoResponse(
  vars: QuoteNoResponseVars,
): RenderedNotification {
  return {
    subject: `[${vars.incidentNumber}] Quote expired — no response received`,
    body: [
      "Hello,",
      "",
      `The repair quote we sent for incident ${vars.incidentNumber} at ${vars.schoolName} was not answered before the hold window closed${
        vars.holdUntil ? ` on ${vars.holdUntil.toISOString().slice(0, 10)}` : ""
      }.`,
      "",
      "We will return the device to the school without making the proposed repairs. Please contact us if you would like to re-open this case.",
      "",
      "— BreakFix Triage",
    ].join("\n"),
  };
}

/**
 * Map NotificationKind to a human-friendly label. Used in the UI's
 * notification log and in audit entries — not a full render, just a
 * descriptor.
 */
export function kindLabel(kind: NotificationKind): string {
  switch (kind) {
    case "DEVICE_SCHEDULED":
      return "Device scheduled";
    case "PICKUP_SCHEDULED":
      return "Pickup scheduled";
    case "DELIVERY_SCHEDULED":
      return "Delivery scheduled";
    case "QUOTE_SENT":
      return "Quote sent";
    case "QUOTE_FOLLOW_UP":
      return "Quote follow-up";
    case "OUT_OF_SCOPE_CLOSURE":
      return "Out-of-scope closure";
    case "NO_RESPONSE_CLOSURE":
      return "No-response closure";
    case "GENERIC":
      return "Generic notification";
  }
}

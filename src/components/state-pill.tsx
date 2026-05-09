import type { TicketState } from "@prisma/client";
import { cn, humaniseEnum } from "@/lib/cn";

/**
 * Compact visual for a ticket state.
 *
 * Closes findings §5.B2 (lane-based palette) and §5.D (titlecase
 * pills, never ALL_CAPS_SNAKE on the user-facing surface).
 *
 * Lanes derive from the §4 status taxonomy ADR
 * (docs/adr/0005-status-taxonomy-simplification.md). Until that
 * migration ships, the legacy 26-state enum is mapped onto the
 * same lane palette here so each visual lane reads as a single
 * colour family on lists and the kanban.
 *
 * Tokens (Tailwind classes) chosen to pass WCAG AA in dark mode;
 * a light-mode pass is part of §5.D follow-up.
 */

type Lane =
  | "intake"
  | "field"
  | "workshop"
  | "parts"
  | "quote"
  | "delivery"
  | "terminal"
  | "exception"
  | "hold";

const LANE_COLOR: Record<Lane, string> = {
  // Intake — cool blue; entry / triage.
  intake: "bg-sky-500/20 text-sky-100 border-sky-500/40",
  // Field — teal; pickup / route / on-site.
  field: "bg-teal-500/20 text-teal-100 border-teal-500/40",
  // Workshop — amber; in the warehouse, on the bench, repairing.
  workshop: "bg-amber-500/20 text-amber-100 border-amber-500/40",
  // Parts — orange; specifically waiting on or ordering parts.
  // Distinct from amber so AWAITING_PARTS reads differently from
  // DIAGNOSIS at a glance — closes §5.B2 collision.
  parts: "bg-orange-500/25 text-orange-100 border-orange-500/50",
  // Quote — purple; commercial-side states.
  quote: "bg-violet-500/20 text-violet-100 border-violet-500/40",
  // Delivery — indigo; return-leg / RMA shipping.
  delivery: "bg-indigo-500/20 text-indigo-100 border-indigo-500/40",
  // Terminal — green-grey; closed / delivered / out-of-scope-closed.
  terminal: "bg-emerald-700/30 text-emerald-100 border-emerald-700/50",
  // Exception — red; rare. RMA, OUT_OF_SCOPE-while-active, REOPENED.
  exception: "bg-red-500/20 text-red-100 border-red-500/40",
  // Hold — slate grey; ON_HOLD overlay or "no SLA" rest states.
  hold: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

const STATE_LANE: Record<TicketState, Lane> = {
  IMPORTED: "intake",
  TRIAGE: "intake",
  AWAITING_PICKUP: "field",
  PICKUP_SCHEDULED: "field",
  AWAITING_ONSITE: "field",
  ONSITE_IN_PROGRESS: "field",
  IN_WAREHOUSE: "workshop",
  DIAGNOSIS: "workshop",
  IN_REPAIR: "workshop",
  REPAIR_COMPLETED: "workshop",
  AWAITING_PARTS: "parts",
  PARTS_ORDERED: "parts",
  QUOTE_REQUIRED: "quote",
  QUOTE_SENT: "quote",
  QUOTE_APPROVED: "quote",
  QUOTE_DECLINED: "quote",
  QUOTE_NO_RESPONSE: "quote",
  PENDING_DELIVERY: "delivery",
  DELIVERY_SCHEDULED: "delivery",
  RETURNED: "delivery",
  INVOICE_REQUIRED: "delivery",
  MANUFACTURER_RMA: "delivery",
  CLOSED: "terminal",
  REOPENED: "exception",
  OUT_OF_SCOPE: "exception",
  ON_HOLD: "hold",
  // Round-4 §N1: synthetic on-route pickups belong in the intake
  // lane visually — same colour family as IMPORTED / TRIAGE so
  // operators read it as "needs human routing".
  PENDING_PICKUP_UNLINKED: "intake",
};

export function StatePill({ state }: { state: TicketState }) {
  const lane = STATE_LANE[state];
  return (
    <span
      title={state}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        LANE_COLOR[lane],
      )}
    >
      {humaniseEnum(state)}
    </span>
  );
}

/** Re-exported for tests + dashboards that want lane grouping. */
export { STATE_LANE };
export type { Lane };

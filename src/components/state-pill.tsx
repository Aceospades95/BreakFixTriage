import type { TicketState } from "@prisma/client";
import { cn } from "@/lib/cn";

/**
 * Compact visual for a ticket state. Colors are grouped by workflow stage:
 *   blue   = intake
 *   indigo = field work
 *   amber  = warehouse / repair
 *   orange = parts / quote hold
 *   violet = quote / commercial
 *   green  = closed / returned
 *   red    = exception / out of scope
 *   slate  = neutral / on hold
 */
const STATE_COLOR: Record<TicketState, string> = {
  IMPORTED: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  TRIAGE: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  AWAITING_PICKUP: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  PICKUP_SCHEDULED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  IN_WAREHOUSE: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  DIAGNOSIS: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  AWAITING_PARTS: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  PARTS_ORDERED: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  IN_REPAIR: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  REPAIR_COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  AWAITING_ONSITE: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  ONSITE_IN_PROGRESS: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  QUOTE_REQUIRED: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  QUOTE_SENT: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  QUOTE_APPROVED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  QUOTE_DECLINED: "bg-red-500/20 text-red-200 border-red-500/40",
  QUOTE_NO_RESPONSE: "bg-red-500/20 text-red-200 border-red-500/40",
  MANUFACTURER_RMA: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  OUT_OF_SCOPE: "bg-red-500/20 text-red-200 border-red-500/40",
  PENDING_DELIVERY: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  DELIVERY_SCHEDULED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  RETURNED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  INVOICE_REQUIRED: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  CLOSED: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  REOPENED: "bg-red-500/20 text-red-200 border-red-500/40",
  ON_HOLD: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

export function StatePill({ state }: { state: TicketState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        STATE_COLOR[state],
      )}
    >
      {state}
    </span>
  );
}

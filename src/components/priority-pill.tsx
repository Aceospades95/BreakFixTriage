import type { TicketPriority } from "@prisma/client";
import { cn } from "@/lib/cn";

/**
 * Compact visual for a ticket priority. The four enum values
 * (URGENT / HIGH / NORMAL / LOW) get distinct colours so a row can
 * be scanned at a glance.
 *
 * Closes findings §2#3 / §6 (Tickets list "add Priority column").
 */

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  URGENT: "bg-red-500/20 text-red-200 border-red-500/40",
  HIGH: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  NORMAL: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  LOW: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function PriorityPill({ priority }: { priority: TicketPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        PRIORITY_COLOR[priority],
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Stable sort key for the four priority values (URGENT > LOW). */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

import type { TicketState } from "@prisma/client";
import {
  daysInState,
  slaHealth,
  slaLabel,
  type SlaTicketSubset,
} from "@/lib/reports/sla";
import { cn } from "@/lib/cn";

/**
 * Days-in-state badge for the ticket list and detail pages. Colors
 * match the SLA classifier buckets so a dispatcher can scan a list
 * and spot the red rows first.
 */
export function SlaBadge({
  ticket,
  now = new Date(),
  compact = false,
}: {
  ticket: SlaTicketSubset & { state: TicketState };
  now?: Date;
  compact?: boolean;
}) {
  const days = daysInState(ticket, now);
  const health = slaHealth(ticket.state, days);
  const label = slaLabel(health, days, ticket.state);

  const cls =
    health === "breached"
      ? "bg-red-500/20 text-red-200 border-red-500/40"
      : health === "approaching"
        ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
        : health === "on_track"
          ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
          : "bg-slate-500/20 text-slate-400 border-slate-500/40";

  return (
    <span
      title={
        health === "na"
          ? "No SLA defined for this state"
          : `${days} day${days === 1 ? "" : "s"} in ${ticket.state}${
              health === "breached" ? " (breached)" : health === "approaching" ? " (approaching)" : ""
            }`
      }
      className={cn(
        "inline-flex items-center rounded border px-1.5 font-mono uppercase tracking-wide",
        compact ? "py-0 text-[9px]" : "py-0.5 text-[10px]",
        cls,
      )}
    >
      {compact ? `${days}d` : label}
    </span>
  );
}

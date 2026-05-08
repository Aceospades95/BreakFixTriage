import type { TicketState } from "@prisma/client";
import {
  DEFAULT_SLA_DAYS,
  daysInState,
  slaHealth,
  slaLabel,
  type SlaTicketSubset,
} from "@/lib/reports/sla";
import { cn, humaniseEnum } from "@/lib/cn";

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

  // 0d SLA is rendered grey, not green — closes findings §5.D.
  // Reserves green ("on_track") for days >= 1 so the eye learns
  // the gradient from grey (untouched today) → green (warm) →
  // amber (approaching) → red (breached).
  const showAsNeutral = health === "na" || days === 0;
  const cls = showAsNeutral
    ? "bg-slate-500/20 text-slate-400 border-slate-500/40"
    : health === "breached"
      ? "bg-red-500/20 text-red-200 border-red-500/40"
      : health === "approaching"
        ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
        : "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";

  // Round-10 §2I — extended tooltip surfaces reportedAt + threshold
  // so operators reading the bench can see the SLA math without
  // navigating into the ticket detail.
  const reportedDate = ticket.reportedAt.toISOString().slice(0, 10);
  const thresholdDays = DEFAULT_SLA_DAYS[ticket.state];
  const thresholdText =
    thresholdDays == null ? "no threshold" : `threshold ${thresholdDays}d`;
  const tooltip =
    health === "na"
      ? `Reported ${reportedDate} · ${days}d in ${humaniseEnum(ticket.state)} · no SLA`
      : `Reported ${reportedDate} · ${days}d in ${humaniseEnum(ticket.state)} · ${thresholdText}${
          health === "breached"
            ? " · breached"
            : health === "approaching"
              ? " · approaching"
              : ""
        }`;

  return (
    <span
      title={tooltip}
      className={cn(
        // Round-2 §14: sans stack across the board; tight tracking
        // keeps the badge compact without monospace.
        // Round-12 §2K: whitespace-nowrap pins "0d" / "1d" / "10d"
        // to a single line. Without it the "0" digit renders ~1px
        // wider than "1" in the system font and forces a line
        // break inside the 26px chip width.
        "inline-flex items-center whitespace-nowrap rounded border px-1.5 font-medium tracking-tight",
        compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]",
        cls,
      )}
    >
      {compact ? `${days}d` : label}
    </span>
  );
}

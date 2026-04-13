import type { TicketState } from "@prisma/client";
import { ALLOWED_TRANSITIONS } from "@/lib/workflow/states";
import { DEFAULT_SLA_DAYS } from "@/lib/reports/sla";

export interface StatusConfig {
  /** Overridden transitions. Missing keys fall back to defaults. */
  transitions: Partial<Record<TicketState, TicketState[]>>;
  /** Overridden SLA day thresholds. Missing keys fall back to defaults. */
  sla: Partial<Record<TicketState, number | null>>;
  /** States hidden from the UI (but still valid in the DB). */
  disabled: TicketState[];
}

/**
 * Get the effective transitions for a state (override or default).
 */
export function getEffectiveTransitions(
  state: TicketState,
  config: StatusConfig,
): TicketState[] {
  if (config.transitions[state]) {
    return config.transitions[state]!;
  }
  return [...ALLOWED_TRANSITIONS[state]];
}

/**
 * Get the effective SLA threshold for a state (override or default).
 */
export function getEffectiveSla(
  state: TicketState,
  config: StatusConfig,
): number | null {
  if (state in config.sla) {
    return config.sla[state] ?? null;
  }
  return DEFAULT_SLA_DAYS[state];
}

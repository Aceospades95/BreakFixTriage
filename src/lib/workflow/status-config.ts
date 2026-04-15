import type { TicketState } from "@prisma/client";
import { ALLOWED_TRANSITIONS } from "@/lib/workflow/states";
import { DEFAULT_SLA_DAYS } from "@/lib/reports/sla";

/**
 * Persisted status workflow configuration.
 *
 * The `TicketState` enum in Prisma is a fixed pool of 26 slots — we
 * can't create truly new states at runtime without a schema migration.
 * Instead, admins can:
 *   - Customize the label shown for any state (`labels`)
 *   - Assign a state to a different section (`sections`)
 *   - Disable a state they don't use (`disabled`)
 *   - Change the transitions graph (`transitions`)
 *   - Change SLA thresholds (`sla`)
 *
 * "Adding a new status" in the UI means picking an unused disabled
 * slot from the pool and giving it a custom label + section.
 */
export interface StatusConfig {
  /** Overridden transitions. Missing keys fall back to defaults. */
  transitions: Partial<Record<TicketState, TicketState[]>>;
  /** Overridden SLA day thresholds. Missing keys fall back to defaults. */
  sla: Partial<Record<TicketState, number | null>>;
  /** States hidden from the UI (but still valid in the DB). */
  disabled: TicketState[];
  /** Custom display labels that override the built-in label. */
  labels?: Partial<Record<TicketState, string>>;
  /** Custom section assignments (e.g. "Field Work") that override the built-in grouping. */
  sections?: Partial<Record<TicketState, string>>;
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

/**
 * Get the effective label for a state (override or default).
 */
export function getEffectiveLabel(
  state: TicketState,
  defaultLabel: string,
  config: StatusConfig,
): string {
  return config.labels?.[state] ?? defaultLabel;
}

/**
 * Get the effective section name for a state (override or default).
 */
export function getEffectiveSection(
  state: TicketState,
  defaultSection: string,
  config: StatusConfig,
): string {
  return config.sections?.[state] ?? defaultSection;
}

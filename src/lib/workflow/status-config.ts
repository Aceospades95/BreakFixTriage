import type { TicketState } from "@prisma/client";
import { ALLOWED_TRANSITIONS } from "@/lib/workflow/states";
import { DEFAULT_SLA_DAYS } from "@/lib/reports/sla";
import { prisma } from "@/lib/db/prisma";

const SETTING_KEY = "status_workflow_config";

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
  /**
   * Round-2 §11: per-state behaviour flags. Persisted in the same
   * AppSetting JSON blob as the rest of StatusConfig so admins can
   * edit without a redeploy. Missing keys fall back to documented
   * defaults: notifyOnEnter=false, kanbanColumn=true, color=null
   * (lane-based palette in src/components/state-pill.tsx).
   */
  notifyOnEnter?: Partial<Record<TicketState, boolean>>;
  kanbanColumn?: Partial<Record<TicketState, boolean>>;
  /** Hex color override (#rrggbb). Falls back to the lane palette. */
  colors?: Partial<Record<TicketState, string>>;
}

export function getEffectiveNotifyOnEnter(
  state: TicketState,
  config: StatusConfig,
): boolean {
  return config.notifyOnEnter?.[state] ?? false;
}

export function getEffectiveKanbanColumn(
  state: TicketState,
  config: StatusConfig,
): boolean {
  // Default: every non-excluded state is a column. The kanban page's
  // own KANBAN_EXCLUDED list (CLOSED / REOPENED / ON_HOLD) still
  // wins. This config is for opting-out a non-excluded state from
  // having its own column (it groups under its section header
  // instead).
  return config.kanbanColumn?.[state] ?? true;
}

export function getEffectiveColor(
  state: TicketState,
  config: StatusConfig,
): string | null {
  return config.colors?.[state] ?? null;
}

/**
 * Read the current status workflow config from the DB.
 *
 * No permission check — callers that gate on role do it themselves.
 * Returns an empty config when nothing has been saved yet.
 */
export async function readStatusConfig(): Promise<StatusConfig> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  if (!setting) return { transitions: {}, sla: {}, disabled: [] };
  try {
    return JSON.parse(setting.value) as StatusConfig;
  } catch {
    return { transitions: {}, sla: {}, disabled: [] };
  }
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

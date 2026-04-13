"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { TicketState } from "@prisma/client";
import { TERMINAL_STATES } from "@/lib/workflow/states";
import { type StatusConfig, getEffectiveTransitions } from "@/lib/workflow/status-config";

const SETTING_KEY = "status_workflow_config";

const ALL_STATES = Object.values(TicketState);

/**
 * Load the current status workflow config from AppSetting, merging with defaults.
 */
export async function loadStatusConfig(): Promise<{
  config: StatusConfig;
  hasOverrides: boolean;
}> {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (!setting) {
    return {
      config: { transitions: {}, sla: {}, disabled: [] },
      hasOverrides: false,
    };
  }

  try {
    const parsed = JSON.parse(setting.value) as StatusConfig;
    return { config: parsed, hasOverrides: true };
  } catch {
    return {
      config: { transitions: {}, sla: {}, disabled: [] },
      hasOverrides: false,
    };
  }
}

/**
 * Validate a config before saving. Returns error messages or empty array.
 */
function validateConfig(config: StatusConfig): string[] {
  const errors: string[] = [];
  const enabledStates = ALL_STATES.filter(
    (s) => !config.disabled.includes(s),
  );

  // Every enabled non-terminal state must have at least one outgoing transition
  for (const state of enabledStates) {
    if (TERMINAL_STATES.includes(state)) continue;
    if (state === "ON_HOLD") continue; // ON_HOLD is special
    if (state === "REOPENED") continue; // REOPENED always goes to TRIAGE

    const transitions = getEffectiveTransitions(state, config);
    const enabledTransitions = transitions.filter(
      (t) => !config.disabled.includes(t),
    );
    if (enabledTransitions.length === 0) {
      errors.push(
        `${state} has no outgoing transitions to enabled states — tickets would get stuck here.`,
      );
    }
  }

  // Transition targets must be valid TicketState values
  for (const [from, targets] of Object.entries(config.transitions)) {
    if (!ALL_STATES.includes(from as TicketState)) {
      errors.push(`Unknown state in transitions: ${from}`);
    }
    for (const target of targets as TicketState[]) {
      if (!ALL_STATES.includes(target)) {
        errors.push(`Unknown transition target: ${from} → ${target}`);
      }
    }
  }

  // Disabled states must not have active tickets (warning, not blocking)
  // This is checked at save time with a DB query

  return errors;
}

/**
 * Save status workflow configuration.
 */
export async function saveStatusConfigAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const rawJson = formData.get("config") as string;
  if (!rawJson) {
    redirect("/admin/statuses?error=" + encodeURIComponent("No config data."));
  }

  let config: StatusConfig;
  try {
    config = JSON.parse(rawJson);
  } catch {
    redirect(
      "/admin/statuses?error=" + encodeURIComponent("Invalid JSON config."),
    );
  }

  // Validate
  const errors = validateConfig(config!);
  if (errors.length > 0) {
    redirect(
      "/admin/statuses?error=" + encodeURIComponent(errors.join(" | ")),
    );
  }

  // Check for active tickets in disabled states
  if (config!.disabled.length > 0) {
    const activeInDisabled = await prisma.ticket.count({
      where: {
        state: { in: config!.disabled },
        closedAt: null,
      },
    });
    if (activeInDisabled > 0) {
      redirect(
        "/admin/statuses?error=" +
          encodeURIComponent(
            `Cannot disable states that have ${activeInDisabled} active ticket(s). Move or close those tickets first.`,
          ),
      );
    }
  }

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(config),
      updatedByUserId: session.userId,
    },
    update: {
      value: JSON.stringify(config),
      updatedByUserId: session.userId,
    },
  });

  redirect("/admin/statuses?saved=1");
}

/**
 * Reset status workflow config to defaults.
 */
export async function resetStatusConfigAction() {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  await prisma.appSetting.deleteMany({
    where: { key: SETTING_KEY },
  });

  redirect("/admin/statuses?reset=1");
}

/**
 * Get counts of active tickets per state (for safety display).
 */
export async function getTicketCountsByState(): Promise<
  Record<string, number>
> {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const counts = await prisma.ticket.groupBy({
    by: ["state"],
    where: { closedAt: null },
    _count: true,
  });

  const result: Record<string, number> = {};
  for (const row of counts) {
    result[row.state] = row._count;
  }
  return result;
}

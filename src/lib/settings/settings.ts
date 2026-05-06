/**
 * App settings — a tiny key/value store with typed accessors.
 *
 * Motivation: some knobs (default hold-window days, SLA thresholds,
 * escalation severity) need to be editable without a redeploy. Using
 * a dedicated table keeps the blast radius small — these are all
 * editable by ADMIN only, audit-logged on every change, and fall
 * back to hardcoded defaults when unset so deployments that never
 * touched the admin page still work.
 *
 * Values are JSON-encoded so one table can hold numbers, booleans,
 * objects, and arrays without another migration.
 */

import { z } from "zod";
import type { PrismaClient, TicketState } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { DEFAULT_SLA_DAYS } from "@/lib/reports/sla";

// ---------------------------------------------------------------------------
// Schema of each known setting
// ---------------------------------------------------------------------------

/**
 * Hold-window days for newly sent quotes. Overridable per-send via
 * the SendQuote form.
 *
 * Minimum is 1 (one full day), not 0. A 0-day window means
 * `holdUntil = sentAt`, i.e. the quote auto-expires the moment it is
 * sent — which is never the desired behavior and was the cause of bug
 * 4d in the audit. See `docs/adr/0003-hold-window-min-1.md`.
 */
const holdWindowSchema = z.coerce.number().int().min(1).max(90);

/**
 * Severity multiplier applied to SLA thresholds before the escalation
 * sweeper flags a ticket as "seriously stuck". A value of 2 means a
 * ticket has to be 2× past the SLA before an escalation fires.
 */
const escalationMultiplierSchema = z.coerce.number().min(1).max(10);

/**
 * Partial override of SLA thresholds. A missing state falls back to
 * the hardcoded DEFAULT_SLA_DAYS. null disables SLA for that state.
 */
const slaThresholdsSchema = z.record(
  z.string(),
  z.number().int().min(0).max(365).nullable(),
);

export const SETTINGS_KEYS = {
  DEFAULT_HOLD_DAYS: "quotes.defaultHoldDays",
  ESCALATION_MULTIPLIER: "sla.escalationMultiplier",
  SLA_THRESHOLDS: "sla.thresholds",
  DIGEST_RECIPIENTS: "digest.recipients",
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Read a raw value from the settings table. Returns null when unset.
 */
export async function getRawSetting(
  key: string,
  db: PrismaClient = defaultPrisma,
): Promise<unknown> {
  const row = await db.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export async function getHoldDays(
  db: PrismaClient = defaultPrisma,
): Promise<number> {
  const raw = await getRawSetting(SETTINGS_KEYS.DEFAULT_HOLD_DAYS, db);
  const parsed = holdWindowSchema.safeParse(raw);
  return parsed.success ? parsed.data : 7;
}

export async function getEscalationMultiplier(
  db: PrismaClient = defaultPrisma,
): Promise<number> {
  const raw = await getRawSetting(SETTINGS_KEYS.ESCALATION_MULTIPLIER, db);
  const parsed = escalationMultiplierSchema.safeParse(raw);
  return parsed.success ? parsed.data : 2;
}

/**
 * Effective SLA threshold table. Starts with `DEFAULT_SLA_DAYS` and
 * merges in any admin-configured overrides.
 */
export async function getSlaThresholds(
  db: PrismaClient = defaultPrisma,
): Promise<Record<TicketState, number | null>> {
  const raw = await getRawSetting(SETTINGS_KEYS.SLA_THRESHOLDS, db);
  const parsed = slaThresholdsSchema.safeParse(raw);
  const overrides = parsed.success ? parsed.data : {};
  const merged = { ...DEFAULT_SLA_DAYS } as Record<TicketState, number | null>;
  for (const [key, value] of Object.entries(overrides)) {
    if (key in merged) {
      (merged as Record<string, number | null>)[key] = value;
    }
  }
  return merged;
}

export async function getDigestRecipients(
  db: PrismaClient = defaultPrisma,
): Promise<string[]> {
  const raw = await getRawSetting(SETTINGS_KEYS.DIGEST_RECIPIENTS, db);
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.includes("@"));
}

// ---------------------------------------------------------------------------
// Write helper
// ---------------------------------------------------------------------------

export interface SetSettingInput {
  key: string;
  value: unknown;
  actorUserId: string | null;
}

export async function setSetting(
  input: SetSettingInput,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const encoded = JSON.stringify(input.value);
  await db.appSetting.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      value: encoded,
      updatedByUserId: input.actorUserId,
    },
    update: {
      value: encoded,
      updatedByUserId: input.actorUserId,
    },
  });
}

export async function getAllSettings(
  db: PrismaClient = defaultPrisma,
): Promise<Record<string, unknown>> {
  const rows = await db.appSetting.findMany();
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

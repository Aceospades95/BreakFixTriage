"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TicketState } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { SETTINGS_KEYS, setSetting } from "@/lib/settings/settings";

/**
 * Admin settings update.
 *
 * Single action that handles all editable knobs; the form on
 * `/admin/settings` submits every current value at once, which keeps
 * the action surface area tiny and makes it obvious what changed.
 */
export async function updateSettingsAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const holdDaysRaw = formData.get("defaultHoldDays")?.toString();
  const multiplierRaw = formData.get("escalationMultiplier")?.toString();
  const digestRecipientsRaw = formData.get("digestRecipients")?.toString();

  const errors: string[] = [];

  if (holdDaysRaw !== undefined) {
    const n = Number(holdDaysRaw);
    // Min is 1 — a 0-day window auto-expires the quote on the next
    // sweep, which is never desired. See bug 4d / ADR 0003.
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 90) {
      errors.push("Default hold days must be a whole number 1–90");
    } else {
      await setSetting({
        key: SETTINGS_KEYS.DEFAULT_HOLD_DAYS,
        value: n,
        actorUserId: session.userId,
      });
    }
  }

  if (multiplierRaw !== undefined) {
    const n = Number(multiplierRaw);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      errors.push("Escalation multiplier must be 1–10");
    } else {
      await setSetting({
        key: SETTINGS_KEYS.ESCALATION_MULTIPLIER,
        value: n,
        actorUserId: session.userId,
      });
    }
  }

  if (digestRecipientsRaw !== undefined) {
    const emails = digestRecipientsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = emails.filter((e) => !e.includes("@"));
    if (invalid.length > 0) {
      errors.push(`Invalid digest emails: ${invalid.join(", ")}`);
    } else {
      await setSetting({
        key: SETTINGS_KEYS.DIGEST_RECIPIENTS,
        value: emails,
        actorUserId: session.userId,
      });
    }
  }

  // Round-22 — email distribution lists. Each textarea is a
  // newline/comma-separated address list persisted as a JSON array.
  const listFields: Array<{ field: string; key: string; label: string }> = [
    { field: "teamEmails", key: SETTINGS_KEYS.WYNNDALCO_TEAM_EMAILS, label: "team" },
    {
      field: "districtLeadershipEmails",
      key: SETTINGS_KEYS.DISTRICT_LEADERSHIP_EMAILS,
      label: "district leadership",
    },
    {
      field: "internalLeadershipEmails",
      key: SETTINGS_KEYS.INTERNAL_LEADERSHIP_EMAILS,
      label: "internal leadership",
    },
    {
      field: "primeLeadershipEmails",
      key: SETTINGS_KEYS.PRIME_LEADERSHIP_EMAILS,
      label: "prime leadership",
    },
  ];
  for (const { field, key, label } of listFields) {
    const raw = formData.get(field)?.toString();
    if (raw === undefined) continue;
    const emails = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = emails.filter((e) => !e.includes("@"));
    if (invalid.length > 0) {
      errors.push(`Invalid ${label} emails: ${invalid.join(", ")}`);
    } else {
      await setSetting({ key, value: emails, actorUserId: session.userId });
    }
  }

  // SLA thresholds come in as named fields `sla_<state>`.
  const stateOverrides: Record<string, number | null> = {};
  for (const state of Object.values(TicketState)) {
    const raw = formData.get(`sla_${state}`)?.toString();
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "none") {
      stateOverrides[state] = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        errors.push(`SLA for ${state} must be 0–365 or blank`);
      } else {
        stateOverrides[state] = n;
      }
    }
  }
  if (Object.keys(stateOverrides).length > 0 && errors.length === 0) {
    await setSetting({
      key: SETTINGS_KEYS.SLA_THRESHOLDS,
      value: stateOverrides,
      actorUserId: session.userId,
    });
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "AppSetting",
    entityId: "bulk-update",
    action: errors.length > 0 ? "update:partial" : "update",
    after: {
      holdDays: holdDaysRaw,
      escalationMultiplier: multiplierRaw,
      errors,
    },
  });

  if (errors.length > 0) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(errors.join("; "))}`,
    );
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=Settings+saved");
}

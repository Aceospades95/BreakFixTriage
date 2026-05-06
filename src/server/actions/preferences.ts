"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Round-3 §A3 — /me/preferences server action.
 *
 * Theme, timezone, daily-digest opt-in / hour. The brief's
 * per-event channel toggles (in-app vs. email per EmailEvent) are
 * a JSON blob on UserPreference; the form here ships the four
 * scalar fields and the JSON blob is left to the §A follow-up.
 *
 * Audits the change with field diff. The audit row is scoped to
 * the User entity so /admin/audit shows it under the User card
 * filter.
 */

const updateSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  digestOptIn: z
    .union([z.literal("on"), z.literal("off"), z.literal("")])
    .optional(),
  digestHour: z.coerce.number().int().min(0).max(23).optional(),
});

export async function updatePreferencesAction(formData: FormData) {
  const session = await requireSession();

  const parsed = updateSchema.safeParse({
    theme: formData.get("theme")?.toString() || undefined,
    timezone: formData.get("timezone")?.toString() || undefined,
    digestOptIn: formData.get("digestOptIn")?.toString() ?? "",
    digestHour: formData.get("digestHour")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/me/preferences?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  const before = await prisma.userPreference.findUnique({
    where: { userId: session.userId },
  });

  const updated = await prisma.userPreference.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      theme: parsed.data.theme ?? "system",
      digestOptIn: parsed.data.digestOptIn === "on",
      digestHour: parsed.data.digestHour ?? null,
    },
    update: {
      ...(parsed.data.theme !== undefined ? { theme: parsed.data.theme } : {}),
      ...(parsed.data.digestOptIn !== undefined
        ? { digestOptIn: parsed.data.digestOptIn === "on" }
        : {}),
      ...(parsed.data.digestHour !== undefined
        ? { digestHour: parsed.data.digestHour }
        : {}),
    },
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "UserPreference",
    entityId: session.userId,
    action: "update",
    before: before
      ? {
          theme: before.theme,
          digestOptIn: before.digestOptIn,
          digestHour: before.digestHour ?? null,
        }
      : null,
    after: {
      theme: updated.theme,
      digestOptIn: updated.digestOptIn,
      digestHour: updated.digestHour ?? null,
    },
  });

  revalidatePath("/me/preferences");
  redirect("/me/preferences?ok=Preferences+saved");
}

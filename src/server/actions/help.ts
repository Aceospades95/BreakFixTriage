"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { setSetting } from "@/lib/settings/settings";
import { writeAudit } from "@/lib/audit/audit";
import { HELP_SOPS_SETTING_KEY } from "@/lib/help/content";
import { withFeedback } from "@/lib/url";

/**
 * Round-22 (demo feedback) — the help center's Team SOPs block is
 * manager-editable in place, so the team can "build out key questions
 * and standard operating procedures" without a deploy. Stored as one
 * AppSetting; `## Heading` lines split it into sections on render.
 */
export async function updateHelpSopsAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);
  const body = (formData.get("sops")?.toString() ?? "").slice(0, 20_000);

  try {
    await setSetting({
      key: HELP_SOPS_SETTING_KEY,
      value: body.trim(),
      actorUserId: session.userId,
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "AppSetting",
      entityId: HELP_SOPS_SETTING_KEY,
      action: "help.sops.updated",
      after: { length: body.trim().length },
      reason: "Team SOPs edited on /help",
    });
  } catch (err) {
    console.error("[updateHelpSopsAction] failed:", err);
    redirect(
      withFeedback("/help", "error", "Couldn't save the SOPs — nothing was changed. Try again."),
    );
  }

  revalidatePath("/help");
  redirect(withFeedback("/help", "ok", "Team SOPs saved."));
}

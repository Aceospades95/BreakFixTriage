"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { withFeedback } from "@/lib/url";

/**
 * Round-22 §2 — acknowledge a high-severity audit event so it leaves the
 * active exceptions count + badge. The acknowledgement is itself audited
 * (who/when, with an optional note) so the trail stays complete; this
 * doesn't delete or hide anything, it just clears the "needs attention"
 * flag.
 */
const acknowledgeSchema = z.object({
  auditId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export async function acknowledgeExceptionAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);
  const parsed = acknowledgeSchema.safeParse({
    auditId: formData.get("auditId"),
    note: formData.get("note")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      withFeedback("/admin/exceptions", "error", "Invalid acknowledge request"),
    );
  }

  let message: string;
  try {
    const row = await prisma.auditLog.findUnique({
      where: { id: parsed.data.auditId },
      select: { id: true, acknowledgedAt: true, action: true },
    });
    if (!row) {
      message = "That exception no longer exists.";
    } else if (row.acknowledgedAt) {
      message = "Already acknowledged.";
    } else {
      await prisma.auditLog.update({
        where: { id: row.id },
        data: {
          acknowledgedAt: new Date(),
          acknowledgedByUserId: session.userId,
        },
      });
      await writeAudit({
        actorUserId: session.userId,
        entityType: "AuditLog",
        entityId: row.id,
        action: "exception.acknowledged",
        after: { acknowledgedAction: row.action, note: parsed.data.note ?? null },
        reason: parsed.data.note ?? null,
      });
      message = "Exception acknowledged — cleared from the active list.";
    }
  } catch (err) {
    console.error("[acknowledgeExceptionAction] failed:", err);
    redirect(
      withFeedback(
        "/admin/exceptions",
        "error",
        "Couldn't acknowledge that exception — nothing was changed. Try again.",
      ),
    );
  }

  revalidatePath("/admin/exceptions");
  redirect(withFeedback("/admin/exceptions", "ok", message));
}

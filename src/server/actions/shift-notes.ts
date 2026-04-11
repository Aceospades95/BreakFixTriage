"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

const schema = z.object({
  body: z.string().trim().min(1).max(5000),
});

/**
 * Post a shift handover note. Any writer role can create one; the
 * feed is visible to everyone with TICKETS_READ.
 */
export async function createShiftNoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);
  const parsed = schema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    redirect(
      `/shift-notes?error=${encodeURIComponent("Note body is required")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const note = await prisma.shiftNote.create({
      data: { authorUserId: session.userId, body: parsed.data.body },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "ShiftNote",
      entityId: note.id,
      action: "create",
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to post note";
  }
  if (errorMessage) {
    redirect(`/shift-notes?error=${encodeURIComponent(errorMessage)}`);
  }
  revalidatePath("/shift-notes");
  redirect("/shift-notes");
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function deleteShiftNoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);
  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    redirect("/shift-notes?error=Invalid+id");
  }
  const note = await prisma.shiftNote.findUnique({
    where: { id: parsed.data.id },
  });
  if (!note) {
    redirect("/shift-notes?error=Not+found");
  }
  if (note.authorUserId !== session.userId && session.role !== "ADMIN") {
    redirect(
      "/shift-notes?error=" +
        encodeURIComponent("You can only delete your own notes"),
    );
  }
  await prisma.shiftNote.delete({ where: { id: parsed.data.id } });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "ShiftNote",
    entityId: parsed.data.id,
    action: "delete",
  });
  revalidatePath("/shift-notes");
  redirect("/shift-notes");
}

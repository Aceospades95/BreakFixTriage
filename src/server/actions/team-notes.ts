"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole, requireSession } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { withFeedback } from "@/lib/url";

/**
 * Round-20 — NY team: "Add a banner for urgent team notes so that
 * everyone sees them. Offer a click sign off to record that the
 * tech acknowledged it."
 *
 * Notes are posted/retired by ops + dispatch (TEAM_NOTES_MANAGE);
 * every signed-in user sees active notes as a banner until they
 * acknowledge. Acks are durable TeamNoteAck rows — /team-notes
 * shows exactly who has and hasn't signed off.
 */

const createSchema = z.object({
  body: z.string().trim().min(5, "Write at least a sentence").max(1000),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 14).optional(),
});

export async function createTeamNoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TEAM_NOTES_MANAGE);
  const parsed = createSchema.safeParse({
    body: formData.get("body"),
    expiresInHours: formData.get("expiresInHours")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      withFeedback(
        "/team-notes",
        "error",
        parsed.error.issues.map((i) => i.message).join("; "),
      ),
    );
  }

  const note = await prisma.teamNote.create({
    data: {
      body: parsed.data.body,
      createdByUserId: session.userId,
      expiresAt: parsed.data.expiresInHours
        ? new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000)
        : null,
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "TeamNote",
    entityId: note.id,
    action: "team-note.created",
    after: { body: parsed.data.body, expiresAt: note.expiresAt },
  });

  revalidatePath("/team-notes");
  revalidatePath("/", "layout");
  redirect(
    withFeedback("/team-notes", "ok", "Note posted — it now banners for everyone until they acknowledge it."),
  );
}

export async function deactivateTeamNoteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TEAM_NOTES_MANAGE);
  const noteId = formData.get("noteId")?.toString();
  if (!noteId) {
    redirect(withFeedback("/team-notes", "error", "Missing note id"));
  }
  const note = await prisma.teamNote.findUnique({ where: { id: noteId } });
  if (!note) {
    redirect(withFeedback("/team-notes", "error", "Note not found"));
  }
  await prisma.teamNote.update({
    where: { id: noteId },
    data: { active: false, deactivatedAt: new Date() },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "TeamNote",
    entityId: noteId,
    action: "team-note.deactivated",
    before: { body: note.body },
  });

  revalidatePath("/team-notes");
  revalidatePath("/", "layout");
  redirect(withFeedback("/team-notes", "ok", "Note retired."));
}

export async function ackTeamNoteAction(formData: FormData) {
  const session = await requireSession();
  const noteId = formData.get("noteId")?.toString();
  // The banner renders on every page, so land back wherever the
  // user was: explicit returnTo first, then the referer path.
  let returnTo = formData.get("returnTo")?.toString() || "";
  if (!returnTo) {
    const ref = headers().get("referer");
    if (ref) {
      try {
        const u = new URL(ref);
        returnTo = `${u.pathname}${u.search}`;
      } catch {
        returnTo = "/";
      }
    } else {
      returnTo = "/";
    }
  }
  if (!noteId) redirect(returnTo);

  // Idempotent — double-clicks and races land on the same ack row.
  await prisma.teamNoteAck.upsert({
    where: { noteId_userId: { noteId, userId: session.userId } },
    create: { noteId, userId: session.userId },
    update: {},
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "TeamNote",
    entityId: noteId,
    action: "team-note.acknowledged",
  });

  revalidatePath("/", "layout");
  revalidatePath("/team-notes");
  // The ok param doubles as feedback (ToastHost) and a URL change —
  // Next's client router can serve a stale layout on a soft
  // redirect to the SAME url even after revalidatePath, which
  // would leave the banner visibly stuck until the next navigation.
  redirect(withFeedback(returnTo, "ok", "Noted — thanks for confirming."));
}

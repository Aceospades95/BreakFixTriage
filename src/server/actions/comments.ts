"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

const createSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1, "comment cannot be empty").max(5000),
});

/**
 * Post a new comment on a ticket. Gated on TICKETS_WRITE — if you
 * can edit the ticket, you can leave notes on it.
 */
export async function createCommentAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = createSchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    redirect(
      `/tickets/${id}?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const comment = await prisma.comment.create({
      data: {
        ticketId: parsed.data.ticketId,
        authorUserId: session.userId,
        body: parsed.data.body,
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Comment",
      entityId: comment.id,
      action: "create",
      after: { ticketId: parsed.data.ticketId },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to post comment";
  }

  if (errorMessage) {
    redirect(
      `/tickets/${parsed.data.ticketId}?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(
    `/tickets/${parsed.data.ticketId}?ok=${encodeURIComponent("Comment posted")}#comments`,
  );
}

const deleteSchema = z.object({
  commentId: z.string().min(1),
  ticketId: z.string().min(1),
});

/**
 * Delete a comment. The author can delete their own comments; ADMIN
 * can delete any comment. Other roles get an authorization error.
 */
export async function deleteCommentAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = deleteSchema.safeParse({
    commentId: formData.get("commentId"),
    ticketId: formData.get("ticketId"),
  });
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    redirect(
      `/tickets/${id}?error=${encodeURIComponent("Invalid delete request")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: parsed.data.commentId },
    });
    if (!comment) {
      errorMessage = "Comment not found";
    } else if (
      comment.authorUserId !== session.userId &&
      session.role !== "ADMIN"
    ) {
      errorMessage = "You can only delete your own comments";
    } else {
      await prisma.comment.delete({ where: { id: parsed.data.commentId } });
      await writeAudit({
        actorUserId: session.userId,
        entityType: "Comment",
        entityId: parsed.data.commentId,
        action: "delete",
        before: { ticketId: parsed.data.ticketId, body: comment.body },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Delete failed";
  }

  if (errorMessage) {
    redirect(
      `/tickets/${parsed.data.ticketId}?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(
    `/tickets/${parsed.data.ticketId}?ok=${encodeURIComponent("Comment deleted")}#comments`,
  );
}

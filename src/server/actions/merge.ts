"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { mergeTicket } from "@/lib/tickets/merge";

const schema = z.object({
  sourceTicketId: z.string().min(1),
  /**
   * The target is specified by incident number from the UI — much
   * easier for a dispatcher to type than a CUID — and resolved to
   * an id server-side.
   */
  targetIncidentNumber: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Merge a ticket into another. Resolves the target by incident
 * number so the UI only needs a text input. The source ticket's
 * state becomes CLOSED and it gets a pointer back to the target;
 * both tickets get a comment explaining the merge.
 */
export async function mergeTicketAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = schema.safeParse({
    sourceTicketId: formData.get("sourceTicketId"),
    targetIncidentNumber: formData.get("targetIncidentNumber"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    const sid = formData.get("sourceTicketId")?.toString() ?? "";
    redirect(`/tickets/${sid}?error=${encodeURIComponent("Invalid merge request")}`);
  }

  const target = await prisma.ticket.findUnique({
    where: { incidentNumber: parsed.data.targetIncidentNumber.toUpperCase() },
  });
  if (!target) {
    redirect(
      `/tickets/${parsed.data.sourceTicketId}?error=${encodeURIComponent(
        `No ticket found with incident number ${parsed.data.targetIncidentNumber}`,
      )}`,
    );
  }

  try {
    await mergeTicket({
      sourceTicketId: parsed.data.sourceTicketId,
      targetTicketId: target.id,
      reason: parsed.data.reason ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    redirect(
      `/tickets/${parsed.data.sourceTicketId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Merge failed")}`,
    );
  }

  revalidatePath(`/tickets/${parsed.data.sourceTicketId}`);
  revalidatePath(`/tickets/${target.id}`);
  redirect(`/tickets/${target.id}?ok=${encodeURIComponent("Ticket merged")}`);
}

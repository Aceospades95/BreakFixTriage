"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TicketState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { mergeTicket } from "@/lib/tickets/merge";
import { writeAudit } from "@/lib/audit/audit";

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
  redirect(
    `/tickets/${target.id}?ok=${encodeURIComponent(
      "Ticket merged",
    )}&dur=6000`,
  );
}

/**
 * Reverse a previous merge. Admin-only — re-opens the source ticket
 * with its pre-merge state restored from the most recent merge audit
 * row, clears the target pointer, and writes an `unmerge` audit row
 * on both sides.
 */
export async function unmergeTicketAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const sourceId = formData.get("sourceTicketId")?.toString();
  if (!sourceId) {
    redirect("/tickets?error=Missing+source+ticket");
  }
  const reason = formData.get("reason")?.toString().trim() || null;

  const source = await prisma.ticket.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      state: true,
      mergedIntoTicketId: true,
      incidentNumber: true,
    },
  });
  if (!source || !source.mergedIntoTicketId) {
    redirect(
      `/tickets/${sourceId}?error=${encodeURIComponent(
        "This ticket isn't merged.",
      )}`,
    );
  }

  const targetId = source.mergedIntoTicketId;
  const lastMergeAudit = await prisma.auditLog.findFirst({
    where: { entityType: "Ticket", entityId: source.id, action: "merge" },
    orderBy: { createdAt: "desc" },
  });
  const before =
    (lastMergeAudit?.before as { state?: string } | null) ?? null;
  const restoreState = (before?.state as TicketState | undefined) ?? "TRIAGE";

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: source.id },
      data: {
        mergedIntoTicketId: null,
        state: restoreState,
        stateEnteredAt: new Date(),
        closedAt: null,
      },
    });
    await writeAudit(
      {
        actorUserId: session.userId,
        entityType: "Ticket",
        entityId: source.id,
        action: "unmerge",
        before: { state: source.state, mergedIntoTicketId: targetId },
        after: { state: restoreState, mergedIntoTicketId: null },
        reason: reason ?? "Unmerge via admin UI",
      },
      tx,
    );
  });

  revalidatePath(`/tickets/${source.id}`);
  revalidatePath(`/tickets/${targetId}`);
  redirect(
    `/tickets/${source.id}?ok=${encodeURIComponent(
      "Merge reversed — source ticket re-opened",
    )}&dur=6000`,
  );
}

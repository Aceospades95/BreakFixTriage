"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DuplicateResolution } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { resolveDuplicate } from "@/lib/duplicates/resolve";
import { mergeTicket } from "@/lib/tickets/merge";

const schema = z.object({
  conflictId: z.string().min(1),
  resolution: z.nativeEnum(DuplicateResolution),
  reason: z.string().max(500).optional(),
});

export async function resolveDuplicateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DUPLICATES_RESOLVE);

  const parsed = schema.safeParse({
    conflictId: formData.get("conflictId"),
    resolution: formData.get("resolution"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/duplicates?error=${encodeURIComponent("Invalid resolution request.")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    await resolveDuplicate({
      conflictId: parsed.data.conflictId,
      resolution: parsed.data.resolution,
      actorUserId: session.userId,
      reason: parsed.data.reason,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Resolution failed.";
  }

  if (errorMessage) {
    redirect(`/duplicates?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath("/duplicates");
  revalidatePath("/tickets");
  redirect("/duplicates");
}

const linkSchema = z.object({
  syntheticTicketId: z.string().min(1),
  targetIncidentNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "Incident # may only contain letters, digits, and dashes"),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Round-5 §1: link a synthetic SYN- ticket (state
 * PENDING_PICKUP_UNLINKED) to the real SNOW incident once it
 * appears. Resolution = merge SYN into SNOW so the synthetic side
 * carries audit history but the live record is the SNOW row.
 */
export async function linkSyntheticToIncidentAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DUPLICATES_RESOLVE);

  const parsed = linkSchema.safeParse({
    syntheticTicketId: formData.get("syntheticTicketId"),
    targetIncidentNumber: formData.get("targetIncidentNumber"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/duplicates?error=${encodeURIComponent(
        parsed.error.issues[0]!.message,
      )}`,
    );
  }

  const target = await prisma.ticket.findUnique({
    where: { incidentNumber: parsed.data.targetIncidentNumber.toUpperCase() },
    select: { id: true, incidentNumber: true },
  });
  if (!target) {
    redirect(
      `/duplicates?error=${encodeURIComponent(
        `No SNOW ticket found with incident number ${parsed.data.targetIncidentNumber}.`,
      )}`,
    );
  }

  try {
    await mergeTicket({
      sourceTicketId: parsed.data.syntheticTicketId,
      targetTicketId: target.id,
      reason: parsed.data.reason ?? "Linked synthetic to SNOW INC#",
      actorUserId: session.userId,
    });
  } catch (err) {
    redirect(
      `/duplicates?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Link failed.",
      )}`,
    );
  }

  revalidatePath("/duplicates");
  revalidatePath("/bench");
  revalidatePath(`/tickets/${target.id}`);
  redirect(
    `/duplicates?ok=${encodeURIComponent(
      `Linked SYN ticket to ${target.incidentNumber}`,
    )}&dur=6000`,
  );
}

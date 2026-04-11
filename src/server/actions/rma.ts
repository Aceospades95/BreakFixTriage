"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createRma, markRmaReceived, markRmaShipped } from "@/lib/rma/rma";

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

const createSchema = z.object({
  ticketId: z.string().min(1),
  rmaNumber: z.string().trim().min(1).max(50),
  vendor: z.string().trim().min(1).max(100),
  trackingOut: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createRmaAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);
  const parsed = createSchema.safeParse({
    ticketId: formData.get("ticketId"),
    rmaNumber: formData.get("rmaNumber"),
    vendor: formData.get("vendor"),
    trackingOut: formData.get("trackingOut")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    const tid = formData.get("ticketId")?.toString() ?? "";
    flashError(
      `/tickets/${tid}`,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let errorMessage: string | null = null;
  try {
    await createRma({
      ticketId: parsed.data.ticketId,
      rmaNumber: parsed.data.rmaNumber,
      vendor: parsed.data.vendor,
      trackingOut: parsed.data.trackingOut ?? null,
      notes: parsed.data.notes ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(`/tickets/${parsed.data.ticketId}`);
}

const shipSchema = z.object({
  rmaId: z.string().min(1),
  ticketId: z.string().min(1),
  trackingOut: z.string().trim().max(100).optional(),
});

export async function markRmaShippedAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);
  const parsed = shipSchema.safeParse({
    rmaId: formData.get("rmaId"),
    ticketId: formData.get("ticketId"),
    trackingOut: formData.get("trackingOut")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError("/tickets", "Invalid ship request");
  }

  try {
    await markRmaShipped({
      rmaId: parsed.data.rmaId,
      trackingOut: parsed.data.trackingOut ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    flashError(
      `/tickets/${parsed.data.ticketId}`,
      err instanceof Error ? err.message : "Ship update failed",
    );
  }
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(`/tickets/${parsed.data.ticketId}`);
}

const receiveSchema = z.object({
  rmaId: z.string().min(1),
  ticketId: z.string().min(1),
  trackingIn: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function markRmaReceivedAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);
  const parsed = receiveSchema.safeParse({
    rmaId: formData.get("rmaId"),
    ticketId: formData.get("ticketId"),
    trackingIn: formData.get("trackingIn")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError("/tickets", "Invalid receive request");
  }

  try {
    await markRmaReceived({
      rmaId: parsed.data.rmaId,
      trackingIn: parsed.data.trackingIn ?? null,
      notes: parsed.data.notes ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    flashError(
      `/tickets/${parsed.data.ticketId}`,
      err instanceof Error ? err.message : "Receive update failed",
    );
  }
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(`/tickets/${parsed.data.ticketId}`);
}

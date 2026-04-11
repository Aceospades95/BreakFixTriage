"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { startTimer, stopTimer } from "@/lib/time/time-tracking";

const startSchema = z.object({
  ticketId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export async function startTimerAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = startSchema.safeParse({
    ticketId: formData.get("ticketId"),
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(`/tickets?error=${encodeURIComponent("Invalid start timer request")}`);
  }

  try {
    await startTimer({
      ticketId: parsed.data.ticketId,
      userId: session.userId,
      notes: parsed.data.notes ?? null,
    });
  } catch (err) {
    redirect(
      `/tickets/${parsed.data.ticketId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Start failed")}`,
    );
  }
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(
    `/tickets/${parsed.data.ticketId}?ok=${encodeURIComponent("Timer started")}`,
  );
}

const stopSchema = z.object({
  entryId: z.string().min(1),
  ticketId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export async function stopTimerAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = stopSchema.safeParse({
    entryId: formData.get("entryId"),
    ticketId: formData.get("ticketId"),
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(`/tickets?error=${encodeURIComponent("Invalid stop timer request")}`);
  }

  try {
    await stopTimer({
      entryId: parsed.data.entryId,
      userId: session.userId,
      notes: parsed.data.notes ?? null,
    });
  } catch (err) {
    redirect(
      `/tickets/${parsed.data.ticketId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Stop failed")}`,
    );
  }
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  redirect(
    `/tickets/${parsed.data.ticketId}?ok=${encodeURIComponent("Timer stopped")}`,
  );
}

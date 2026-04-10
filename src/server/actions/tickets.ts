"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketState } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  GuardFailedError,
  InvalidTransitionError,
  transitionTicket,
} from "@/lib/workflow";

const schema = z.object({
  ticketId: z.string().min(1),
  to: z.nativeEnum(TicketState),
  reason: z.string().max(500).optional(),
});

/**
 * Transition a ticket from one state to another. Called by the transition
 * forms on the ticket detail page. Errors are reported back via a
 * query string on the ticket detail URL so the UI can show them in a
 * banner without needing error boundaries.
 */
export async function transitionTicketAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  const parsed = schema.safeParse({
    ticketId: formData.get("ticketId"),
    to: formData.get("to"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    redirect(
      `/tickets/${id}?error=${encodeURIComponent("Invalid transition form data.")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    await transitionTicket(parsed.data.ticketId, parsed.data.to, {
      reason: parsed.data.reason,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = formatTransitionError(err);
  }

  if (errorMessage) {
    redirect(
      `/tickets/${parsed.data.ticketId}?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

function formatTransitionError(err: unknown): string {
  if (err instanceof InvalidTransitionError) {
    return `Not allowed: ${err.from} → ${err.to}. Pick a different target state.`;
  }
  if (err instanceof GuardFailedError) {
    return `Blocked by guard ${err.guard}: ${err.message.split(": ").slice(-1)[0]}`;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error during transition.";
}

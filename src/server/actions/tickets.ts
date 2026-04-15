"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type Prisma, TicketPriority, TicketState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { createInAppNotification } from "@/lib/notifications/in-app";
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

const forceSchema = z.object({
  ticketId: z.string().min(1),
  to: z.nativeEnum(TicketState),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Admin escape hatch: force a ticket into any state, bypassing the
 * state-machine edge check and the workflow guards.
 *
 * Used when the default transitions paint a ticket into a corner —
 * e.g. a ticket accidentally moved to PENDING_DELIVERY with no
 * scheduled job and no way back. Every force write is audited and
 * the reason is required so the override is traceable.
 *
 * Gated on `USERS_MANAGE` (ADMIN only by default).
 */
export async function forceTransitionTicketAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const parsed = forceSchema.safeParse({
    ticketId: formData.get("ticketId"),
    to: formData.get("to"),
    reason: formData.get("reason")?.toString().trim() || "",
  });

  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    redirect(
      `/tickets/${id}?error=${encodeURIComponent("A reason (≥3 chars) is required to force a transition.")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    await transitionTicket(parsed.data.ticketId, parsed.data.to, {
      reason: `[forced] ${parsed.data.reason}`,
      actorUserId: session.userId,
      force: true,
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

const updateSchema = z.object({
  ticketId: z.string().min(1),
  priority: z.nativeEnum(TicketPriority).optional(),
  shortDescription: z.string().trim().min(1).max(500).optional(),
  longDescription: z.string().trim().max(5000).nullable().optional(),
  assignedUserId: z.string().nullable().optional(),
  invoiceRequired: z.boolean().optional(),
});

/**
 * Edit a ticket's in-place fields (not its state). Kept as a
 * general-purpose "patch some fields" action because the inline
 * edit forms on the ticket detail page all post to the same
 * endpoint — each form just includes the field(s) it changes.
 *
 * Every applied change writes an AuditLog row so reviewers can
 * trace who edited what. State transitions still go through
 * `transitionTicketAction` because they have guards and cascade
 * into the state machine.
 */
export async function updateTicketAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const raw = {
    ticketId: formData.get("ticketId"),
    priority: formData.get("priority") || undefined,
    shortDescription: formData.get("shortDescription")?.toString() || undefined,
    longDescription: formData.has("longDescription")
      ? (formData.get("longDescription")?.toString() ?? null)
      : undefined,
    assignedUserId: formData.has("assignedUserId")
      ? (formData.get("assignedUserId")?.toString() || null)
      : undefined,
    invoiceRequired: formData.has("invoiceRequired")
      ? formData.get("invoiceRequired") === "true"
      : undefined,
  };

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    const id = formData.get("ticketId")?.toString() ?? "";
    redirect(
      `/tickets/${id}?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: parsed.data.ticketId },
    });
    if (!existing) {
      errorMessage = "Ticket not found";
    } else {
      const data: Record<string, unknown> = {};
      const before: Record<string, string | number | boolean | null> = {};
      const after: Record<string, string | number | boolean | null> = {};
      if (
        parsed.data.priority !== undefined &&
        parsed.data.priority !== existing.priority
      ) {
        data.priority = parsed.data.priority;
        before.priority = existing.priority;
        after.priority = parsed.data.priority;
      }
      if (
        parsed.data.shortDescription !== undefined &&
        parsed.data.shortDescription !== existing.shortDescription
      ) {
        data.shortDescription = parsed.data.shortDescription;
        before.shortDescription = existing.shortDescription;
        after.shortDescription = parsed.data.shortDescription;
      }
      if (
        parsed.data.longDescription !== undefined &&
        parsed.data.longDescription !== existing.longDescription
      ) {
        data.longDescription = parsed.data.longDescription;
        before.longDescription = existing.longDescription;
        after.longDescription = parsed.data.longDescription;
      }
      if (
        parsed.data.assignedUserId !== undefined &&
        parsed.data.assignedUserId !== existing.assignedUserId
      ) {
        data.assignedUserId = parsed.data.assignedUserId;
        before.assignedUserId = existing.assignedUserId;
        after.assignedUserId = parsed.data.assignedUserId;
      }
      if (
        parsed.data.invoiceRequired !== undefined &&
        parsed.data.invoiceRequired !== existing.invoiceRequired
      ) {
        data.invoiceRequired = parsed.data.invoiceRequired;
        before.invoiceRequired = existing.invoiceRequired;
        after.invoiceRequired = parsed.data.invoiceRequired;
      }

      if (Object.keys(data).length > 0) {
        await prisma.ticket.update({
          where: { id: parsed.data.ticketId },
          data,
        });
        await writeAudit({
          actorUserId: session.userId,
          entityType: "Ticket",
          entityId: parsed.data.ticketId,
          action: "update",
          before,
          after,
        });

        // Fire an in-app notification to the new assignee (if the
        // assignee actually changed to someone other than the actor
        // themselves — nobody wants to be notified about their own
        // actions).
        if (
          "assignedUserId" in after &&
          typeof after.assignedUserId === "string" &&
          after.assignedUserId !== session.userId
        ) {
          await createInAppNotification({
            recipientUserId: after.assignedUserId,
            kind: "TICKET_ASSIGNED",
            title: `Assigned: ${existing.incidentNumber}`,
            body: existing.shortDescription,
            linkHref: `/tickets/${existing.id}`,
          });
        }
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
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

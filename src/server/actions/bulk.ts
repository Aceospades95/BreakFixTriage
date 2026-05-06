"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";
import { createInAppNotification } from "@/lib/notifications/in-app";
import { publish } from "@/lib/events/bus";

/**
 * Bulk operations on the ticket list.
 *
 * All three actions receive `ticketIds` as a repeated form field and
 * a `returnTo` path to land on after the operation. Each one reports
 * a short summary via a `?ok=` query param on the return path.
 */

const ticketIdsSchema = z
  .array(z.string().min(1))
  .min(1, "pick at least one ticket")
  .max(500);

const bulkTransitionSchema = z.object({
  ticketIds: ticketIdsSchema,
  to: z.nativeEnum(TicketState),
  reason: z.string().max(500).optional(),
});

/**
 * Bulk state transition. Skips tickets that can't legally transition
 * to the target, counts successes and failures, and records a single
 * audit entry per bulk action.
 */
export async function bulkTransitionAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  const ticketIds = formData
    .getAll("ticketIds")
    .map((v) => v.toString())
    .filter(Boolean);
  const returnTo = formData.get("returnTo")?.toString() || "/tickets";

  const parsed = bulkTransitionSchema.safeParse({
    ticketIds,
    to: formData.get("to"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `${returnTo}?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  let success = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const id of parsed.data.ticketIds) {
    try {
      await transitionTicket(id, parsed.data.to, {
        actorUserId: session.userId,
        reason: parsed.data.reason ?? `Bulk transition to ${parsed.data.to}`,
      });
      success += 1;
    } catch (err) {
      skipped += 1;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "BulkAction",
    entityId: `bulk-transition-${Date.now()}`,
    action: "bulk-transition",
    after: {
      to: parsed.data.to,
      total: parsed.data.ticketIds.length,
      success,
      skipped,
    },
  });

  revalidatePath("/tickets");
  // One coarse event — per-ticket events were already emitted inside
  // transitionTicket, but subscribers listening on just the bulk
  // topic get a single notification instead of N.
  publish({ topic: "tickets.bulk-changed", reason: "bulk-transition" });
  const summary = `Moved ${success}/${parsed.data.ticketIds.length} to ${parsed.data.to}${skipped > 0 ? ` (${skipped} skipped)` : ""}`;
  redirect(`${returnTo}?ok=${encodeURIComponent(summary)}`);
}

const bulkAssignSchema = z.object({
  ticketIds: ticketIdsSchema,
  assigneeUserId: z.string().nullable(),
});

/**
 * Bulk assign. Empty-string assignee clears the assignment on every
 * selected ticket.
 */
export async function bulkAssignAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const ticketIds = formData
    .getAll("ticketIds")
    .map((v) => v.toString())
    .filter(Boolean);
  const returnTo = formData.get("returnTo")?.toString() || "/tickets";

  const rawAssignee = formData.get("assigneeUserId")?.toString();
  const parsed = bulkAssignSchema.safeParse({
    ticketIds,
    assigneeUserId: rawAssignee ? rawAssignee : null,
  });
  if (!parsed.success) {
    redirect(
      `${returnTo}?error=${encodeURIComponent("Invalid bulk assign")}`,
    );
  }

  const result = await prisma.ticket.updateMany({
    where: { id: { in: parsed.data.ticketIds } },
    data: { assignedUserId: parsed.data.assigneeUserId },
  });

  // Fire in-app notifications for the new assignee, if any.
  if (parsed.data.assigneeUserId) {
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: parsed.data.ticketIds } },
      select: { id: true, incidentNumber: true, school: { select: { name: true } } },
    });
    for (const t of tickets) {
      await createInAppNotification({
        recipientUserId: parsed.data.assigneeUserId,
        kind: "TICKET_ASSIGNED",
        title: `Assigned: ${t.incidentNumber}`,
        body: t.school.name,
        linkHref: `/tickets/${t.id}`,
      });
    }
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "BulkAction",
    entityId: `bulk-assign-${Date.now()}`,
    action: "bulk-assign",
    after: {
      assigneeUserId: parsed.data.assigneeUserId,
      updated: result.count,
      ticketIds: parsed.data.ticketIds,
    },
  });

  revalidatePath("/tickets");
  // Reassignment changes which bucket each ticket lands in on the
  // bench and on the My Day "team queues" panel — invalidate both
  // so the Router cache doesn't show stale data after redirect.
  revalidatePath("/bench");
  revalidatePath("/");
  publish({ topic: "tickets.bulk-changed", reason: "bulk-assign" });
  const summary = parsed.data.assigneeUserId
    ? `Assigned ${result.count} tickets`
    : `Unassigned ${result.count} tickets`;
  redirect(`${returnTo}?ok=${encodeURIComponent(summary)}`);
}

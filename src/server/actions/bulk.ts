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
import { dispatchEmailEvent } from "@/lib/email";
import { buildTicketEmailVariables } from "@/lib/email/variables";
import { publish } from "@/lib/events/bus";
import { humanise } from "@/lib/format";
import { withFeedback } from "@/lib/url";

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
  // Round-22 §4 — a bulk state change carries the same weight as the
  // ticket page's force-change, which requires a reason; match that
  // guardrail here instead of leaving it optional.
  reason: z
    .string()
    .trim()
    .min(3, "Add a reason for the bulk status change")
    .max(500),
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

  // A missing target is the most common slip (Apply clicked with the
  // picker still on "pick state…"). Say so in operator language
  // instead of leaking a zod enum dump.
  const toRaw = formData.get("to")?.toString() ?? "";
  if (!toRaw) {
    redirect(
      withFeedback(
        returnTo,
        "error",
        "Pick a target status first, then Apply.",
      ),
    );
  }

  const reasonRaw = formData.get("reason")?.toString().trim() || "";
  if (reasonRaw.length < 3) {
    redirect(
      withFeedback(
        returnTo,
        "error",
        "Add a reason for the bulk status change before applying.",
      ),
    );
  }

  const parsed = bulkTransitionSchema.safeParse({
    ticketIds,
    to: toRaw,
    reason: reasonRaw,
  });
  if (!parsed.success) {
    const friendly = parsed.error.issues
      .map((i) =>
        i.path[0] === "to" ? "Unknown target status" : i.message,
      )
      .join("; ");
    redirect(withFeedback(returnTo, "error", friendly));
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
  // Round-18 — operator-facing copy: humanised state, and when
  // everything was skipped say WHY instead of a bare "0/2 moved".
  // Round-21 — when the move lands tickets in a "ready" bucket,
  // point at the next operational step so the flow doesn't dead-end.
  const target = humanise(parsed.data.to);
  const nextStepHint =
    success > 0 &&
    (parsed.data.to === "AWAITING_PICKUP" ||
      parsed.data.to === "PENDING_DELIVERY" ||
      parsed.data.to === "AWAITING_ONSITE")
      ? " Next: open Scheduling to put them on a route."
      : "";
  const summary =
    success === 0
      ? `No tickets moved — ${skipped} selected ticket${skipped === 1 ? " is" : "s are"} not allowed to go to ${target} from their current state.`
      : `Moved ${success}/${parsed.data.ticketIds.length} to ${target}${skipped > 0 ? ` — ${skipped} skipped (transition not allowed from their current state)` : ""}.${nextStepHint}`;
  redirect(withFeedback(returnTo, success === 0 ? "error" : "ok", summary));
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
      withFeedback(returnTo, "error", "Invalid bulk assign"),
    );
  }

  const result = await prisma.ticket.updateMany({
    where: { id: { in: parsed.data.ticketIds } },
    data: { assignedUserId: parsed.data.assigneeUserId },
  });

  // Fire in-app notifications + ticket_assigned email events
  // for the new assignee, if any. The email goes through
  // dispatchEmailEvent (Round-2 §B + Round-3 §B) — single choke
  // point so the audit + log + per-event-disable from
  // /admin/email-rules all keep working.
  if (parsed.data.assigneeUserId) {
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: parsed.data.ticketIds } },
      select: {
        id: true,
        incidentNumber: true,
        schoolId: true,
        shortDescription: true,
        school: { select: { name: true } },
      },
    });
    const assignee = await prisma.user.findUnique({
      where: { id: parsed.data.assigneeUserId },
      select: { name: true, email: true },
    });
    for (const t of tickets) {
      await createInAppNotification({
        recipientUserId: parsed.data.assigneeUserId,
        kind: "TICKET_ASSIGNED",
        title: `Assigned: ${t.incidentNumber}`,
        body: t.school.name,
        linkHref: `/tickets/${t.id}`,
      });
      try {
        // Round-15 — shared builder; the old inline blob used a
        // relative /tickets/<cuid> link, dead inside a mail client.
        const variables = await buildTicketEmailVariables(t.id, prisma, {
          assignee: {
            name: assignee?.name ?? "(unknown)",
            email: assignee?.email ?? "",
          },
        });
        if (!variables) continue;
        await dispatchEmailEvent("ticket_assigned", {
          ticketId: t.id,
          schoolId: t.schoolId,
          actorUserId: session.userId,
          variables,
        });
      } catch (err) {
        // Don't fail the bulk-assign on a downstream email problem.
        console.warn(
          `[email] dispatch ticket_assigned failed for ${t.incidentNumber}:`,
          err,
        );
      }
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
  redirect(withFeedback(returnTo, "ok", summary));
}

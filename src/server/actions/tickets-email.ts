"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { dispatchEmailEvent } from "@/lib/email";
import { buildTicketEmailVariables } from "@/lib/email/variables";

/**
 * Round-6 §3B — manual operator-to-SPOC ticket update.
 *
 * Operator clicks "Email SPOC" on a ticket detail; the drawer
 * pre-fills subject + body from the `ticket_update_to_spoc` template
 * and posts here. The action enforces:
 *
 *   - The actor has TICKETS_WRITE.
 *   - The ticket exists and the ticket's school has at least one
 *     active SPOC contact (Contact with receivesTicketEmails=true).
 *   - The dispatch goes through `dispatchEmailEvent` (G4 invariant).
 *
 * Audit: writes a Ticket-entity audit row with
 * note=manual_email_to_spoc + the actor + the resolved recipient
 * count. The EmailLog row is written by dispatchEmailEvent itself.
 */

const schema = z.object({
  ticketId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
});

export interface EmailSpocResult {
  ok: true;
  recipients: number;
}

export async function emailSpocFromTicket(input: {
  ticketId: string;
  subject: string;
  body: string;
}): Promise<EmailSpocResult> {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    select: {
      id: true,
      schoolId: true,
      incidentNumber: true,
      shortDescription: true,
      state: true,
      school: {
        select: {
          name: true,
          contacts: {
            where: { receivesTicketEmails: true, email: { not: null } },
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
  });
  if (!ticket) throw new Error("Ticket not found");
  if (ticket.school.contacts.length === 0) {
    throw new Error(
      "No SPOC contact with email is configured for this school.",
    );
  }

  await dispatchEmailEvent("ticket_update_to_spoc", {
    ticketId: ticket.id,
    schoolId: ticket.schoolId,
    actorUserId: session.userId,
    // Round-15 — shared builder; the old inline blob used a
    // relative /tickets/<cuid> link (dead inside a mail client)
    // and a raw enum for {{ticket.status}}.
    variables: (await buildTicketEmailVariables(ticket.id, prisma, {
      body: parsed.data.body,
      // The render layer prefers explicit subject overrides via the
      // template, but pass the operator-edited subject as a variable
      // so a future template can choose `{{customSubject}}` if it
      // wants the operator's exact wording.
      customSubject: parsed.data.subject,
    })) ?? { body: parsed.data.body },
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "Ticket",
    entityId: ticket.id,
    action: "manual_email_to_spoc",
    after: {
      recipients: ticket.school.contacts.length,
      subject: parsed.data.subject,
    },
    reason: `Manual SPOC update from ${session.name}`,
  });

  revalidatePath(`/tickets/${ticket.id}`);
  return { ok: true, recipients: ticket.school.contacts.length };
}

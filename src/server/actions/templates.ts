"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketPriority } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Ticket template admin + quick-create.
 *
 * Templates are a tiny feature with an outsized impact on data-
 * entry speed: "cracked screen", "battery won't charge", "wifi
 * dead" as one-click presets so ops doesn't re-type the same
 * short description for the tenth time this week.
 *
 * `createTicketFromTemplateAction` is the quick-create used on
 * the ticket list; it needs a school id but defaults everything
 * else from the template. The resulting ticket lands in the
 * normal IMPORTED state so the state machine still governs its
 * lifecycle.
 */

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// Template admin: create / update / toggle active
// ---------------------------------------------------------------------------

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  shortDescription: z.string().trim().min(1).max(500),
  longDescription: z.string().trim().max(5000).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
});

export async function createTemplateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = createTemplateSchema.safeParse({
    name: formData.get("name"),
    shortDescription: formData.get("shortDescription"),
    longDescription: formData.get("longDescription")?.toString() || undefined,
    priority: formData.get("priority") || undefined,
  });
  if (!parsed.success) {
    flashError(
      "/admin/templates",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  try {
    const row = await prisma.ticketTemplate.create({
      data: {
        name: parsed.data.name,
        shortDescription: parsed.data.shortDescription,
        longDescription: parsed.data.longDescription ?? null,
        priority: parsed.data.priority ?? TicketPriority.NORMAL,
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "TicketTemplate",
      entityId: row.id,
      action: "create",
      after: { name: row.name },
    });
  } catch (err) {
    flashError(
      "/admin/templates",
      err instanceof Error ? err.message : "Create failed",
    );
  }

  revalidatePath("/admin/templates");
  redirect("/admin/templates?ok=Template+created");
}

const toggleSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function toggleTemplateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) {
    flashError("/admin/templates", "Invalid toggle");
  }
  try {
    await prisma.ticketTemplate.update({
      where: { id: parsed.data.id },
      data: { active: parsed.data.active },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "TicketTemplate",
      entityId: parsed.data.id,
      action: parsed.data.active ? "activate" : "deactivate",
    });
  } catch (err) {
    flashError(
      "/admin/templates",
      err instanceof Error ? err.message : "Toggle failed",
    );
  }
  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}

// ---------------------------------------------------------------------------
// Quick-create from template
// ---------------------------------------------------------------------------

const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  schoolId: z.string().min(1),
  deviceSerial: z.string().trim().max(100).optional(),
  overrideShortDescription: z.string().trim().max(500).optional(),
});

/**
 * Create a ticket from a template. Generates an internal-only
 * incident number (prefix `LOCAL`) since these tickets don't
 * originate from ServiceNow. The state machine still governs the
 * lifecycle — the ticket starts in IMPORTED and moves forward
 * through normal transitions.
 */
export async function createTicketFromTemplateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = createFromTemplateSchema.safeParse({
    templateId: formData.get("templateId"),
    schoolId: formData.get("schoolId"),
    deviceSerial: formData.get("deviceSerial")?.toString() || undefined,
    overrideShortDescription:
      formData.get("overrideShortDescription")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError(
      "/tickets",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let createdId: string | null = null;
  try {
    const template = await prisma.ticketTemplate.findUnique({
      where: { id: parsed.data.templateId },
    });
    if (!template || !template.active) {
      throw new Error("Template not found or inactive");
    }

    const school = await prisma.school.findUnique({
      where: { id: parsed.data.schoolId },
    });
    if (!school) throw new Error("School not found");

    let deviceId: string | null = null;
    if (parsed.data.deviceSerial) {
      const device = await prisma.device.findUnique({
        where: { serialNumber: parsed.data.deviceSerial },
      });
      if (device) deviceId = device.id;
    }

    // Generate an internal incident number that doesn't clash with
    // ServiceNow's INCxxxxx space.
    const stamp = Date.now().toString(36).toUpperCase().slice(-7);
    const incidentNumber = `LOCAL${stamp}`;

    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber,
        schoolId: school.id,
        deviceId,
        reportedAt: new Date(),
        shortDescription:
          parsed.data.overrideShortDescription ?? template.shortDescription,
        longDescription: template.longDescription,
        priority: template.priority,
        state: "IMPORTED",
      },
    });
    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        fromState: null,
        toState: "IMPORTED",
        actorUserId: session.userId,
        reason: `Created from template "${template.name}"`,
        payload: { templateId: template.id },
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Ticket",
      entityId: ticket.id,
      action: "create:from-template",
      after: { templateId: template.id, incidentNumber },
    });
    createdId = ticket.id;
  } catch (err) {
    flashError(
      "/tickets",
      err instanceof Error ? err.message : "Quick-create failed",
    );
  }

  revalidatePath("/tickets");
  redirect(createdId ? `/tickets/${createdId}?ok=Ticket+created` : "/tickets");
}

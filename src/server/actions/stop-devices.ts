"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketSource, TicketState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Round-4 §N1 — add / remove a device line on a route stop.
 *
 * The brief specifies three add kinds:
 *
 *   1. `existing` — the operator typed a serial / asset tag and
 *      picked an existing Device row. If that device has an open
 *      ticket at the stop's school, attach that ticket to the stop.
 *      Otherwise create a synthetic Ticket in
 *      PENDING_PICKUP_UNLINKED and link it.
 *   2. `placeholder` — the operator created a brand-new Device
 *      row inline (serial required, asset tag optional, model + condition).
 *      Always creates a synthetic Ticket in PENDING_PICKUP_UNLINKED.
 *
 * Remove writes `removedAt` / `removedByUserId` / `removedReason` —
 * the device row stays for audit. The brief is explicit: removing
 * a device from a stop does NOT close its ticket.
 *
 * Every add audits on TWO entities:
 *   - the new (or attached) Ticket: source = ROUTE_PICKUP,
 *     note = "Created via on-route pickup by {tech}".
 *   - the Stop: action = `route.stop.device.added`.
 *
 * Every remove audits on the Stop + on the Ticket (note = "Removed
 * from stop {id} by {tech}: {reason}").
 *
 * Schema-shape: see prisma/schema.prisma `model StopDevice` +
 * `enum TicketSource` + `PENDING_PICKUP_UNLINKED` value on
 * `enum TicketState`.
 */

const addExistingSchema = z.object({
  stopId: z.string().min(1),
  kind: z.literal("existing"),
  deviceId: z.string().min(1),
});

const addPlaceholderSchema = z.object({
  stopId: z.string().min(1),
  kind: z.literal("placeholder"),
  serial: z.string().trim().min(1).max(120),
  assetTag: z.string().trim().min(1).max(120).optional(),
  modelId: z.string().min(1),
  condition: z.string().trim().max(500).optional(),
});

const removeSchema = z.object({
  stopDeviceId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

const cancelStopSchema = z.object({
  stopId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export interface AddDeviceResult {
  stopDeviceId: string;
  ticketId: string;
  /** Set when the add path created a new synthetic ticket. */
  syntheticTicketCreated: boolean;
  /** Set when the add path linked an existing open ticket. */
  attachedExistingTicket: boolean;
}

/**
 * Add a device to a stop. Returns the new StopDevice row + ticket
 * info. Throws on validation / FK errors; the caller is the form
 * action wrapper below.
 */
export async function addDeviceToStop(
  input:
    | {
        stopId: string;
        kind: "existing";
        deviceId: string;
      }
    | {
        stopId: string;
        kind: "placeholder";
        serial: string;
        assetTag?: string;
        modelId: string;
        condition?: string;
      },
): Promise<AddDeviceResult> {
  const session = await requireRole(PERMISSIONS.STOPS_UPDATE);

  // Resolve the stop + its school. Used for both the existing-
  // device-with-open-ticket short-circuit AND the synthetic
  // ticket creation.
  const stop = await prisma.routeStop.findUnique({
    where: { id: input.stopId },
    include: {
      job: { select: { schoolId: true, school: { select: { name: true } } } },
    },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  const schoolId = stop.job.schoolId;

  return prisma.$transaction(async (tx) => {
    // Resolve / create the Device.
    let deviceId: string;
    if (input.kind === "existing") {
      const dev = await tx.device.findUnique({
        where: { id: input.deviceId },
        select: { id: true, ownerSchoolId: true, serialNumber: true },
      });
      if (!dev) throw new Error("Device not found");
      deviceId = dev.id;
    } else {
      // placeholder
      // Idempotent on serial — the serial is the unique key on
      // Device. If it already exists, attach to that row.
      const existing = await tx.device.findUnique({
        where: { serialNumber: input.serial },
        select: { id: true },
      });
      if (existing) {
        deviceId = existing.id;
      } else {
        const created = await tx.device.create({
          data: {
            serialNumber: input.serial,
            assetTag: input.assetTag ?? null,
            modelId: input.modelId,
            ownerSchoolId: schoolId,
            notes: input.condition ?? null,
            firstSeenAt: new Date(),
          },
          select: { id: true },
        });
        deviceId = created.id;
        await writeAudit(
          {
            actorUserId: session.userId,
            entityType: "Device",
            entityId: deviceId,
            action: "create",
            after: {
              serialNumber: input.serial,
              ownerSchoolId: schoolId,
              source: "route_pickup_placeholder",
            },
            reason: "Created via on-route placeholder add",
          },
          tx,
        );
      }
    }

    // Look for an existing open ticket on (deviceId, schoolId).
    const openTicket = await tx.ticket.findFirst({
      where: {
        deviceId,
        schoolId,
        // Open = not CLOSED. Past Round-3 patterns use this.
        state: { not: TicketState.CLOSED },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, incidentNumber: true, state: true },
    });

    let ticketId: string;
    let syntheticTicketCreated = false;
    let attachedExistingTicket = false;
    if (openTicket) {
      // Attach the existing ticket; do not change its state.
      ticketId = openTicket.id;
      attachedExistingTicket = true;
    } else {
      // No open ticket → mint a synthetic one in PENDING_PICKUP_UNLINKED.
      // Round-5 §1: "SYN-" prefix per the brief — easy to grep, easy to
      // distinguish from SNOW-issued INC numbers, and the /tickets/[id]
      // INC-URL redirect honours the prefix when an operator types one
      // into the URL bar.
      const stamp = Date.now().toString(36).toUpperCase().slice(-7);
      const incidentNumber = `SYN-${stamp}`;
      const created = await tx.ticket.create({
        data: {
          incidentNumber,
          schoolId,
          deviceId,
          reportedAt: new Date(),
          shortDescription: input.kind === "placeholder"
            ? `On-route pickup: serial ${input.serial}${input.condition ? ` (${input.condition})` : ""}`
            : "On-route pickup",
          state: TicketState.PENDING_PICKUP_UNLINKED,
          source: TicketSource.ROUTE_PICKUP,
          priority: "NORMAL",
        },
        select: { id: true, incidentNumber: true },
      });
      ticketId = created.id;
      syntheticTicketCreated = true;

      // Open the timeline with a TicketEvent so /tickets/[id] shows the
      // create as the first row. State machine engine isn't called here
      // because the ticket is born in PENDING_PICKUP_UNLINKED, not
      // transitioned into it.
      await tx.ticketEvent.create({
        data: {
          ticketId,
          fromState: null,
          toState: TicketState.PENDING_PICKUP_UNLINKED,
          actorUserId: session.userId,
          reason: `Created via on-route pickup by ${session.name}`,
          payload: { stopId: input.stopId, source: "ROUTE_PICKUP" },
        },
      });
      await writeAudit(
        {
          actorUserId: session.userId,
          entityType: "Ticket",
          entityId: ticketId,
          action: "create:on-route-pickup",
          after: {
            incidentNumber: created.incidentNumber,
            state: TicketState.PENDING_PICKUP_UNLINKED,
            source: TicketSource.ROUTE_PICKUP,
            stopId: input.stopId,
          },
          reason: `Created via on-route pickup by ${session.name}`,
          transitionType: "manual",
        },
        tx,
      );
    }

    // Create the StopDevice link.
    const stopDevice = await tx.stopDevice.create({
      data: {
        stopId: input.stopId,
        deviceId,
        ticketId,
        addedByUserId: session.userId,
      },
      select: { id: true },
    });

    // Audit on the Stop.
    await writeAudit(
      {
        actorUserId: session.userId,
        entityType: "RouteStop",
        entityId: input.stopId,
        action: "route.stop.device.added",
        after: {
          stopDeviceId: stopDevice.id,
          deviceId,
          ticketId,
          kind: input.kind,
          syntheticTicketCreated,
          attachedExistingTicket,
        },
        reason:
          input.kind === "placeholder"
            ? `Placeholder device added: ${input.serial}`
            : "Existing device added",
      },
      tx,
    );

    return {
      stopDeviceId: stopDevice.id,
      ticketId,
      syntheticTicketCreated,
      attachedExistingTicket,
    };
  });
}

/**
 * Remove a device line from a stop. The device row stays for audit
 * (with `removedAt` set); the linked ticket is NOT closed —
 * removal-from-stop is a stop-level action only. The brief is
 * explicit about this.
 *
 * Caller (the form below) prompts the operator to confirm and then
 * checks whether the stop has any remaining devices; if zero, the
 * UI offers to cancel the stop (`cancelStop` action).
 */
export async function removeDeviceFromStop(input: {
  stopDeviceId: string;
  reason?: string;
}): Promise<{ stopId: string; ticketId: string | null; remaining: number }> {
  const session = await requireRole(PERMISSIONS.STOPS_UPDATE);

  return prisma.$transaction(async (tx) => {
    const sd = await tx.stopDevice.findUnique({
      where: { id: input.stopDeviceId },
      select: {
        id: true,
        stopId: true,
        ticketId: true,
        deviceId: true,
        removedAt: true,
      },
    });
    if (!sd) throw new Error("Stop device line not found");
    if (sd.removedAt) {
      // Idempotent: already removed; surface the same payload as
      // a fresh remove so the caller doesn't crash.
      const remaining = await tx.stopDevice.count({
        where: { stopId: sd.stopId, removedAt: null },
      });
      return { stopId: sd.stopId, ticketId: sd.ticketId, remaining };
    }

    await tx.stopDevice.update({
      where: { id: sd.id },
      data: {
        removedAt: new Date(),
        removedByUserId: session.userId,
        removedReason: input.reason ?? null,
      },
    });

    await writeAudit(
      {
        actorUserId: session.userId,
        entityType: "RouteStop",
        entityId: sd.stopId,
        action: "route.stop.device.removed",
        after: {
          stopDeviceId: sd.id,
          deviceId: sd.deviceId,
          ticketId: sd.ticketId,
          reason: input.reason ?? null,
        },
        reason: input.reason ?? null,
      },
      tx,
    );
    if (sd.ticketId) {
      await writeAudit(
        {
          actorUserId: session.userId,
          entityType: "Ticket",
          entityId: sd.ticketId,
          action: "route.stop.device.removed",
          after: { stopId: sd.stopId, reason: input.reason ?? null },
          reason: `Removed from stop ${sd.stopId} by ${session.name}${input.reason ? `: ${input.reason}` : ""}`,
        },
        tx,
      );
    }

    const remaining = await tx.stopDevice.count({
      where: { stopId: sd.stopId, removedAt: null },
    });

    return { stopId: sd.stopId, ticketId: sd.ticketId, remaining };
  });
}

/**
 * Form-action wrapper for add. Used when the brief calls for an
 * inline form / drawer; the page can also call addDeviceToStop
 * directly when richer UI affordances are needed.
 */
export async function addDeviceToStopAction(formData: FormData) {
  const stopId = formData.get("stopId")?.toString() ?? "";
  const kind = formData.get("kind")?.toString();

  if (kind === "existing") {
    const parsed = addExistingSchema.safeParse({
      stopId,
      kind,
      deviceId: formData.get("deviceId"),
    });
    if (!parsed.success) {
      redirect(
        `/scheduling/routes?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
      );
    }
    await addDeviceToStop(parsed.data);
  } else if (kind === "placeholder") {
    const parsed = addPlaceholderSchema.safeParse({
      stopId,
      kind,
      serial: formData.get("serial"),
      assetTag: formData.get("assetTag")?.toString() || undefined,
      modelId: formData.get("modelId"),
      condition: formData.get("condition")?.toString() || undefined,
    });
    if (!parsed.success) {
      redirect(
        `/scheduling/routes?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
      );
    }
    await addDeviceToStop(parsed.data);
  } else {
    redirect(
      `/scheduling/routes?error=${encodeURIComponent("Unknown add kind")}`,
    );
  }

  revalidatePath(`/scheduling/routes`);
  redirect(
    `/scheduling/routes?ok=${encodeURIComponent("Device added to stop")}`,
  );
}

export async function removeDeviceFromStopAction(formData: FormData) {
  const parsed = removeSchema.safeParse({
    stopDeviceId: formData.get("stopDeviceId"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/scheduling/routes?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
    );
  }
  const { stopId, remaining } = await removeDeviceFromStop(parsed.data);
  revalidatePath(`/scheduling/routes`);
  // Important toast (Round-4 pre-work-1): operator should
  // acknowledge the "stop is now empty" prompt before it disappears.
  if (remaining === 0) {
    redirect(
      `/scheduling/routes/${stopId}?important=1&ok=${encodeURIComponent(
        "Device removed. This stop now has no devices — cancel the stop?",
      )}`,
    );
  }
  redirect(
    `/scheduling/routes?ok=${encodeURIComponent("Device removed from stop")}`,
  );
}

/**
 * Cancel a stop with a required reason. Used by the "stop has no
 * devices" prompt and by the manual cancel action.
 */
export async function cancelStopAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);
  const parsed = cancelStopSchema.safeParse({
    stopId: formData.get("stopId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    redirect(
      `/scheduling/routes?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
    );
  }

  const stop = await prisma.routeStop.findUnique({
    where: { id: parsed.data.stopId },
    select: { id: true, status: true, routeId: true },
  });
  if (!stop) {
    redirect(`/scheduling/routes?error=${encodeURIComponent("Stop not found")}`);
  }

  await prisma.routeStop.update({
    where: { id: parsed.data.stopId },
    data: { status: "CANCELLED" },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "RouteStop",
    entityId: parsed.data.stopId,
    action: "route.stop.cancel",
    before: { status: stop.status },
    after: { status: "CANCELLED" },
    reason: parsed.data.reason,
  });

  revalidatePath(`/scheduling/routes`);
  redirect(
    `/scheduling/routes/${stop.routeId}?ok=${encodeURIComponent("Stop cancelled")}`,
  );
}

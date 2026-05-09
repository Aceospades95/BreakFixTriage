"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  StopDevicePurpose,
  TicketSource,
  TicketState,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { formatStopLabel } from "@/lib/audit/format";

/**
 * Add / remove a device line on a route stop.
 *
 * Add kinds:
 *
 *   1. `existing` — the operator picked an existing Device row.
 *      Path resolves an open ticket at the stop's school (or, when
 *      `incidentNumber` is supplied, attaches that specific ticket
 *      after a tenant-aware lookup). Falls back to minting a
 *      synthetic ticket in PENDING_PICKUP_UNLINKED if no real
 *      ticket fits.
 *   2. `placeholder` — the operator created a brand-new Device
 *      row inline (serial required, asset tag optional, model + condition).
 *      Path attaches the supplied incidentNumber when present, else
 *      mints a synthetic ticket in PENDING_PICKUP_UNLINKED.
 *
 * Every add carries a `purpose` (PICKUP | DELIVERY). Defaults to the
 * parent Job.type when not supplied. Operators set this when they
 * encounter a missed pickup during a delivery (or vice versa) on a
 * combined visit.
 *
 * Remove writes `removedAt` / `removedByUserId` / `removedReason`.
 * The reason is REQUIRED at the action layer (min 3 chars) — the
 * device row stays for audit; the linked ticket stays open.
 *
 * Every add audits on TWO entities:
 *   - the Ticket (new or attached): action = `create:on-route-pickup`
 *     when synthetic, `route.stop.attached` when reusing an
 *     existing INC.
 *   - the Stop: action = `route.stop.device.added` with `purpose`
 *     and `incidentNumber` recorded on `after`.
 *
 * Every remove audits on the Stop + on the Ticket. `reason` lives
 * in the dedicated AuditLog.reason column (R13 §1J) so /admin/audit
 * filters work without a JSON path query.
 */

const purposeEnum = z.enum(["PICKUP", "DELIVERY"]).optional();

// Accept SNOW INC numbers (e.g. INC2200126) and synthetic SYN
// incident numbers. We match an internal id (cuid) too so an
// operator pasting a ticket id from a URL bar still works.
const incidentNumberSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .optional();

const addExistingSchema = z.object({
  stopId: z.string().min(1),
  kind: z.literal("existing"),
  deviceId: z.string().min(1),
  incidentNumber: incidentNumberSchema,
  purpose: purposeEnum,
});

const addPlaceholderSchema = z.object({
  stopId: z.string().min(1),
  kind: z.literal("placeholder"),
  serial: z.string().trim().min(1).max(120),
  assetTag: z.string().trim().min(1).max(120).optional(),
  modelId: z.string().min(1),
  condition: z.string().trim().max(500).optional(),
  incidentNumber: incidentNumberSchema,
  purpose: purposeEnum,
});

// Reason is now REQUIRED (min 3 chars). The R13 §scheduling brief
// asks "if we are removing something from the route, we should
// have to list a reason" — enforced here so the form layer can
// surface the validation message inline.
const removeSchema = z.object({
  stopDeviceId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, "Reason is required (min 3 characters)")
    .max(500),
});

const cancelStopSchema = z.object({
  stopId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export interface AddDeviceResult {
  stopDeviceId: string;
  ticketId: string;
  incidentNumber: string;
  /** Set when the add path created a new synthetic ticket. */
  syntheticTicketCreated: boolean;
  /** Set when the add path linked an existing open ticket
      (either auto-resolved or supplied via incidentNumber). */
  attachedExistingTicket: boolean;
  /** PICKUP or DELIVERY — what this device is doing on the stop. */
  purpose: "PICKUP" | "DELIVERY";
}

/**
 * Add a device to a stop. Returns the new StopDevice row + ticket
 * info. Throws on validation / FK errors; the caller is the form
 * action wrapper below.
 *
 * `incidentNumber` lets an operator attach a known existing ticket
 * (typed straight from a SNOW notification or printed work order)
 * instead of relying on the auto-resolve. The lookup is scoped to
 * the stop's school so a typo can't attach a cross-tenant ticket.
 *
 * `purpose` defaults to the parent Job's natural type (PICKUP for
 * PICKUP/ONSITE_REPAIR/OTHER jobs; DELIVERY for DELIVERY jobs) so
 * the existing single-purpose flow keeps working.
 */
export async function addDeviceToStop(
  input:
    | {
        stopId: string;
        kind: "existing";
        deviceId: string;
        incidentNumber?: string;
        purpose?: "PICKUP" | "DELIVERY";
      }
    | {
        stopId: string;
        kind: "placeholder";
        serial: string;
        assetTag?: string;
        modelId: string;
        condition?: string;
        incidentNumber?: string;
        purpose?: "PICKUP" | "DELIVERY";
      },
): Promise<AddDeviceResult> {
  const session = await requireRole(PERMISSIONS.STOPS_UPDATE);

  // Resolve the stop + its school. Used for both the existing-
  // device-with-open-ticket short-circuit AND the synthetic
  // ticket creation.
  const stop = await prisma.routeStop.findUnique({
    where: { id: input.stopId },
    include: {
      job: {
        select: {
          schoolId: true,
          type: true,
          school: { select: { name: true } },
        },
      },
    },
  });
  if (!stop) {
    throw new Error("Stop not found");
  }
  const schoolId = stop.job.schoolId;
  const purpose: StopDevicePurpose =
    input.purpose === "DELIVERY" || stop.job.type === "DELIVERY"
      ? StopDevicePurpose.DELIVERY
      : StopDevicePurpose.PICKUP;
  // The operator-supplied override always wins, even when the job's
  // natural type would say the opposite — that's the whole point of
  // the field.
  const finalPurpose: StopDevicePurpose = input.purpose
    ? (input.purpose as StopDevicePurpose)
    : purpose;

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

    // 1. Operator supplied an incidentNumber → look that one up
    //    explicitly. Tenant-scoped on the stop's school so a typo
    //    can't attach a ticket from a different district.
    let resolvedTicket: {
      id: string;
      incidentNumber: string;
      state: TicketState;
    } | null = null;
    if (input.incidentNumber) {
      const supplied = input.incidentNumber.trim();
      resolvedTicket = await tx.ticket.findFirst({
        where: {
          schoolId,
          OR: [
            { incidentNumber: supplied },
            { id: supplied },
          ],
        },
        select: { id: true, incidentNumber: true, state: true },
      });
      if (!resolvedTicket) {
        throw new Error(
          `Ticket ${supplied} not found at this school. Check the incident number.`,
        );
      }
    }

    // 2. No explicit number → look for an existing open ticket on
    //    (deviceId, schoolId). Falls back to minting a synthetic.
    const openTicket =
      resolvedTicket ??
      (await tx.ticket.findFirst({
        where: {
          deviceId,
          schoolId,
          // Open = not CLOSED. Past Round-3 patterns use this.
          state: { not: TicketState.CLOSED },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, incidentNumber: true, state: true },
      }));

    let ticketId: string;
    let resolvedIncidentNumber: string;
    let syntheticTicketCreated = false;
    let attachedExistingTicket = false;
    if (openTicket) {
      ticketId = openTicket.id;
      resolvedIncidentNumber = openTicket.incidentNumber;
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
      resolvedIncidentNumber = created.incidentNumber;
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

    // Create the StopDevice link, recording the per-line purpose
    // alongside the ticket attachment.
    const stopDevice = await tx.stopDevice.create({
      data: {
        stopId: input.stopId,
        deviceId,
        ticketId,
        addedByUserId: session.userId,
        purpose: finalPurpose,
      },
      select: { id: true },
    });

    // Audit on the Stop. Round-6 §2E persists `routeId` in `after`
    // so the audit IdChip can build /scheduling/routes/{routeId}#stop-{stopId}.
    // The `purpose` and `incidentNumber` lift onto the after column
    // so /admin/audit can show the operator's intent without opening
    // the row.
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
          incidentNumber: resolvedIncidentNumber,
          purpose: finalPurpose,
          kind: input.kind,
          syntheticTicketCreated,
          attachedExistingTicket,
          routeId: stop.routeId,
        },
        reason:
          input.kind === "placeholder"
            ? `Placeholder device added (${finalPurpose.toLowerCase()}): ${input.serial}`
            : `Existing device added (${finalPurpose.toLowerCase()})`,
      },
      tx,
    );

    return {
      stopDeviceId: stopDevice.id,
      ticketId,
      incidentNumber: resolvedIncidentNumber,
      syntheticTicketCreated,
      attachedExistingTicket,
      purpose:
        finalPurpose === StopDevicePurpose.DELIVERY ? "DELIVERY" : "PICKUP",
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
}): Promise<{
  stopId: string;
  routeId: string;
  ticketId: string | null;
  remaining: number;
}> {
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
        stop: {
          select: {
            routeId: true,
            sequence: true,
            route: { select: { date: true } },
            job: { select: { school: { select: { name: true } } } },
          },
        },
      },
    });
    if (!sd) throw new Error("Stop device line not found");
    if (sd.removedAt) {
      // Idempotent: already removed; surface the same payload as
      // a fresh remove so the caller doesn't crash.
      const remaining = await tx.stopDevice.count({
        where: { stopId: sd.stopId, removedAt: null },
      });
      return {
        stopId: sd.stopId,
        routeId: sd.stop.routeId,
        ticketId: sd.ticketId,
        remaining,
      };
    }

    await tx.stopDevice.update({
      where: { id: sd.id },
      data: {
        removedAt: new Date(),
        removedByUserId: session.userId,
        removedReason: input.reason ?? null,
      },
    });

    // Round-6 §2A — resolve the stop cuid into a human label so
    // /admin/audit doesn't show "stop cmotifeq30009406if73wy5fj".
    const stopLabel = formatStopLabel(
      { sequence: sd.stop.sequence, school: sd.stop.job.school },
      { date: sd.stop.route.date },
    );

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
          stopLabel,
          // Round-6 §2E — IdChip context.
          routeId: sd.stop.routeId,
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
          after: {
            stopId: sd.stopId,
            stopLabel,
            reason: input.reason ?? null,
          },
          reason: `Removed from ${stopLabel} by ${session.name}${input.reason ? `: ${input.reason}` : ""}`,
        },
        tx,
      );
    }

    const remaining = await tx.stopDevice.count({
      where: { stopId: sd.stopId, removedAt: null },
    });

    return {
      stopId: sd.stopId,
      routeId: sd.stop.routeId,
      ticketId: sd.ticketId,
      remaining,
    };
  });
}

/**
 * Form-action wrapper for add. Used when the brief calls for an
 * inline form / drawer; the page can also call addDeviceToStop
 * directly when richer UI affordances are needed.
 *
 * Round-6 §1A: redirects land on the route detail page
 * (`/scheduling/routes/{routeId}`), not the plural index that 404s.
 * The routeId is resolved from the stopId once at the top of the
 * action so every redirect path uses the same target.
 */
export async function addDeviceToStopAction(formData: FormData) {
  const stopId = formData.get("stopId")?.toString() ?? "";
  const kind = formData.get("kind")?.toString();

  const stop = stopId
    ? await prisma.routeStop.findUnique({
        where: { id: stopId },
        select: { routeId: true },
      })
    : null;
  const routeRedirect = stop
    ? `/scheduling/routes/${stop.routeId}`
    : "/scheduling";

  // The success branch needs the result so we can surface the
  // ticket number in the toast — operators want to see it
  // immediately after add (the request that triggered this round).
  let result: AddDeviceResult | null = null;

  try {
    if (kind === "existing") {
      const parsed = addExistingSchema.safeParse({
        stopId,
        kind,
        deviceId: formData.get("deviceId"),
        incidentNumber:
          formData.get("incidentNumber")?.toString() || undefined,
        purpose: formData.get("purpose")?.toString() || undefined,
      });
      if (!parsed.success) {
        redirect(
          `${routeRedirect}?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
        );
      }
      result = await addDeviceToStop(parsed.data);
    } else if (kind === "placeholder") {
      const parsed = addPlaceholderSchema.safeParse({
        stopId,
        kind,
        serial: formData.get("serial"),
        assetTag: formData.get("assetTag")?.toString() || undefined,
        modelId: formData.get("modelId"),
        condition: formData.get("condition")?.toString() || undefined,
        incidentNumber:
          formData.get("incidentNumber")?.toString() || undefined,
        purpose: formData.get("purpose")?.toString() || undefined,
      });
      if (!parsed.success) {
        redirect(
          `${routeRedirect}?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
        );
      }
      result = await addDeviceToStop(parsed.data);
    } else {
      redirect(
        `${routeRedirect}?error=${encodeURIComponent("Unknown add kind")}`,
      );
    }
  } catch (err) {
    // Re-throw redirect signals so Next.js can navigate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to add device";
    redirect(`${routeRedirect}?error=${encodeURIComponent(message)}`);
  }

  if (stop) revalidatePath(`/scheduling/routes/${stop.routeId}`);
  // Surface the ticket number + purpose in the success toast so the
  // operator can confirm the right INC was attached and the right
  // intent (pickup vs delivery) was recorded.
  const verb =
    result?.purpose === "DELIVERY" ? "delivery" : "pickup";
  const inc = result?.incidentNumber ?? "ticket";
  redirect(
    `${routeRedirect}?ok=${encodeURIComponent(`Device added (${verb}) → ${inc}`)}`,
  );
}

/**
 * Round-6 §1B: redirects land on `/scheduling/routes/{routeId}`
 * for both the success and the empty-stop-prompt branches. The
 * inner `removeDeviceFromStop` now returns `routeId` so the action
 * doesn't need a second DB round-trip.
 */
export async function removeDeviceFromStopAction(formData: FormData) {
  const stopDeviceId = formData.get("stopDeviceId")?.toString() ?? "";
  // Resolve the routeId once so the error redirect lands back on
  // the route detail page (the form lives on that page).
  const sd = stopDeviceId
    ? await prisma.stopDevice.findUnique({
        where: { id: stopDeviceId },
        select: { stop: { select: { routeId: true } } },
      })
    : null;
  const errorRedirect = sd
    ? `/scheduling/routes/${sd.stop.routeId}`
    : "/scheduling";

  const parsed = removeSchema.safeParse({
    stopDeviceId,
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    // Required-reason violation lands here — operator gets the
    // same form back with a visible error message at the top.
    redirect(
      `${errorRedirect}?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
    );
  }
  const { routeId, remaining } = await removeDeviceFromStop(parsed.data);
  revalidatePath(`/scheduling/routes/${routeId}`);
  // Important toast: operator should acknowledge the "stop is now
  // empty" prompt before it disappears.
  if (remaining === 0) {
    redirect(
      `/scheduling/routes/${routeId}?important=1&ok=${encodeURIComponent(
        "Device removed. This stop now has no devices — cancel the stop?",
      )}`,
    );
  }
  redirect(
    `/scheduling/routes/${routeId}?ok=${encodeURIComponent("Device removed from stop")}`,
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

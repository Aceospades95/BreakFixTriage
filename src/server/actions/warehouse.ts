"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket, canTransition } from "@/lib/workflow";

const schema = z.object({
  serial: z.string().trim().min(1),
});

/** States a warehouse scan-in can pull a ticket out of. */
const INTAKE_STATES = [
  "IMPORTED",
  "AWAITING_PICKUP",
  "PICKUP_SCHEDULED",
] as const;

/**
 * Warehouse scan-in.
 *
 * Scan a device barcode (serial or asset tag) OR a ticket number at
 * the warehouse door and:
 *   1. Resolve the tickets — every open pre-warehouse ticket on the
 *      device (IMPORTED / AWAITING_PICKUP / PICKUP_SCHEDULED), or the
 *      one ticket the scanned incident number names
 *   2. Transition each to IN_WAREHOUSE via the state machine, which
 *      stamps the intake date on the event timeline
 *   3. Report the count of transitions + any that skipped
 *
 * Round-22 (demo) — the migration-intake flow: import the batch, then
 * scan gun down the pile; each scan marks its ticket "brought into the
 * warehouse" with the date, no per-ticket clicking. (ServiceNow still
 * needs its own update until we have API access.)
 */
export async function scanInDeviceAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  const parsed = schema.safeParse({ serial: formData.get("serial") });
  if (!parsed.success) {
    redirect(`/scan/warehouse?error=${encodeURIComponent("No serial scanned")}`);
  }

  const scanned = parsed.data.serial.trim();

  // Ticket-number path: the label on the pile is sometimes the INC
  // sticker, not the device barcode. Exact match, any case.
  const byIncident = await prisma.ticket.findFirst({
    where: { incidentNumber: { equals: scanned, mode: "insensitive" } },
    select: { id: true, incidentNumber: true, state: true, deviceId: true },
  });

  let scanLabel = scanned.toUpperCase();
  let deviceId: string | null = null;
  let candidates: { id: string; incidentNumber: string; state: (typeof INTAKE_STATES)[number] | string }[] =
    [];

  if (byIncident) {
    scanLabel = byIncident.incidentNumber;
    deviceId = byIncident.deviceId;
    candidates = [byIncident];
  } else {
    const device = await prisma.device.findFirst({
      where: {
        OR: [
          { serialNumber: { equals: scanned, mode: "insensitive" } },
          { assetTag: { equals: scanned, mode: "insensitive" } },
        ],
      },
      include: {
        tickets: {
          where: { state: { in: [...INTAKE_STATES] } },
          orderBy: { reportedAt: "desc" },
        },
      },
    });
    if (!device) {
      redirect(
        `/scan/warehouse?error=${encodeURIComponent(
          `Nothing matched ${scanned} — scan the device serial, asset tag, or the ticket number`,
        )}`,
      );
    }
    scanLabel = device.serialNumber;
    deviceId = device.id;
    candidates = device.tickets;
    if (candidates.length === 0) {
      redirect(
        `/scan/warehouse?error=${encodeURIComponent(
          `${device.serialNumber} has no tickets awaiting warehouse check-in`,
        )}`,
      );
    }
  }

  let transitioned = 0;
  const skipped: string[] = [];
  for (const t of candidates) {
    if (!canTransition(t.state as Parameters<typeof canTransition>[0], "IN_WAREHOUSE")) {
      skipped.push(`${t.incidentNumber} (${t.state})`);
      continue;
    }
    try {
      await transitionTicket(t.id, "IN_WAREHOUSE", {
        actorUserId: session.userId,
        reason: `Warehouse scan-in: ${scanLabel}`,
        payload: { source: "warehouse-scan", deviceId },
      });
      transitioned += 1;
    } catch (err) {
      skipped.push(
        `${t.incidentNumber} (${err instanceof Error ? err.message : "error"})`,
      );
    }
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: deviceId ? "Device" : "Ticket",
    entityId: deviceId ?? candidates[0]!.id,
    action: "warehouse-scan-in",
    after: {
      scanned: scanLabel,
      transitioned,
      skipped,
    },
  });

  const summary =
    transitioned > 0
      ? `${scanLabel}: moved ${transitioned}/${candidates.length} to In warehouse${
          skipped.length > 0 ? ` (${skipped.length} skipped)` : ""
        }`
      : `${scanLabel}: nothing moved — ${skipped.join("; ")}`;
  revalidatePath("/scan/warehouse");
  revalidatePath("/tickets");
  redirect(
    `/scan/warehouse?${transitioned > 0 ? "ok" : "error"}=${encodeURIComponent(summary)}`,
  );
}

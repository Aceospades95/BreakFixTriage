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

/**
 * Warehouse scan-in.
 *
 * Scan a device serial (or asset tag) at the warehouse door and:
 *   1. Look up the device
 *   2. Find every open ticket on that device that's in a
 *      pre-warehouse state (AWAITING_PICKUP, PICKUP_SCHEDULED)
 *   3. Transition each such ticket to IN_WAREHOUSE via the state
 *      machine (guards still apply)
 *   4. Report the count of transitions + any that skipped
 *
 * This replaces the "scan → navigate to page → click transition"
 * flow with a single action call. The warehouse page posts the
 * decoded scan here and gets redirected with a summary toast.
 */
export async function scanInDeviceAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  const parsed = schema.safeParse({ serial: formData.get("serial") });
  if (!parsed.success) {
    redirect(`/scan/warehouse?error=${encodeURIComponent("No serial scanned")}`);
  }

  const serial = parsed.data.serial.toUpperCase();

  const device = await prisma.device.findFirst({
    where: {
      OR: [
        { serialNumber: { equals: serial, mode: "insensitive" } },
        { assetTag: { equals: serial, mode: "insensitive" } },
      ],
    },
    include: {
      tickets: {
        where: { state: { in: ["AWAITING_PICKUP", "PICKUP_SCHEDULED"] } },
        orderBy: { reportedAt: "desc" },
      },
    },
  });

  if (!device) {
    redirect(
      `/scan/warehouse?error=${encodeURIComponent(`No device found for ${serial}`)}`,
    );
  }
  if (device.tickets.length === 0) {
    redirect(
      `/scan/warehouse?error=${encodeURIComponent(
        `${device.serialNumber} has no tickets awaiting warehouse check-in`,
      )}`,
    );
  }

  let transitioned = 0;
  const skipped: string[] = [];
  for (const t of device.tickets) {
    if (!canTransition(t.state, "IN_WAREHOUSE")) {
      skipped.push(`${t.incidentNumber} (${t.state})`);
      continue;
    }
    try {
      await transitionTicket(t.id, "IN_WAREHOUSE", {
        actorUserId: session.userId,
        reason: `Warehouse scan-in: ${device.serialNumber}`,
        payload: { source: "warehouse-scan", deviceId: device.id },
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
    entityType: "Device",
    entityId: device.id,
    action: "warehouse-scan-in",
    after: {
      serial: device.serialNumber,
      transitioned,
      skipped,
    },
  });

  const summary = `${device.serialNumber}: moved ${transitioned}/${device.tickets.length} to IN_WAREHOUSE${
    skipped.length > 0 ? ` (${skipped.length} skipped)` : ""
  }`;
  revalidatePath("/scan/warehouse");
  revalidatePath("/tickets");
  redirect(`/scan/warehouse?ok=${encodeURIComponent(summary)}`);
}

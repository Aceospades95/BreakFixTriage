"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket, canTransition } from "@/lib/workflow";
import {
  deviceWhereForSession,
  ticketWhereForSession,
} from "@/lib/data/forSession";

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
 *   3. Clean up now-pointless unscheduled pickup jobs, and flag
 *      tickets already on a scheduled route so dispatch hears about
 *      it before the driver does
 *   4. Report the count of transitions + any that skipped
 *
 * Round-22 (demo) — the migration-intake flow: import the batch, then
 * scan gun down the pile; each scan marks its ticket "brought into the
 * warehouse" with the date, no per-ticket clicking. (ServiceNow still
 * needs its own update until we have API access.)
 *
 * Tenant scoping (ADR 0014): both lookups are constrained to the
 * session's districts, mirroring src/lib/scan/resolve.ts. A scan of a
 * foreign district's INC or serial falls through to the generic
 * "Nothing matched" error — no existence or state oracle.
 *
 * Lookups are exact-match on the raw and uppercased scan value so the
 * unique indexes on incidentNumber / serialNumber / assetTag are
 * used. Scan guns emit exactly what's printed on the label, so a
 * fuzzy match isn't worth a sequential scan per trigger pull.
 */
export async function scanInDeviceAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_TRANSITION);

  const parsed = schema.safeParse({ serial: formData.get("serial") });
  if (!parsed.success) {
    redirect(`/scan/warehouse?error=${encodeURIComponent("No serial scanned")}`);
  }

  const scanned = parsed.data.serial.trim();
  const variants = [...new Set([scanned, scanned.toUpperCase()])];
  const ticketScope = ticketWhereForSession(session);
  const deviceScope = deviceWhereForSession(session);

  // Ticket-number path: the label on the pile is sometimes the INC
  // sticker, not the device barcode.
  const byIncident = await prisma.ticket.findFirst({
    where: {
      AND: [ticketScope, { incidentNumber: { in: variants } }],
    },
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
        AND: [
          deviceScope,
          {
            OR: [
              { serialNumber: { in: variants } },
              { assetTag: { in: variants } },
            ],
          },
        ],
      },
      include: {
        tickets: {
          where: { state: { in: [...INTAKE_STATES] } },
          orderBy: { reportedAt: "desc" },
          take: 25,
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
  const dispatchHeadsUp: string[] = [];
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

      // The device is physically here, so a pickup visit is
      // pointless. Unlink this ticket from pickup jobs dispatch
      // hasn't put on a route yet, and cancel any job left empty.
      // Jobs already SCHEDULED stay untouched — the route exists and
      // silently mutating it would surprise the driver — but the
      // operator gets a heads-up to tell dispatch.
      const links = await prisma.ticketJob.findMany({
        where: {
          ticketId: t.id,
          job: { type: "PICKUP", status: { in: ["UNSCHEDULED", "SCHEDULED"] } },
        },
        select: { job: { select: { id: true, status: true } } },
      });
      for (const link of links) {
        if (link.job.status !== "UNSCHEDULED") {
          dispatchHeadsUp.push(t.incidentNumber);
          continue;
        }
        await prisma.ticketJob.delete({
          where: { ticketId_jobId: { ticketId: t.id, jobId: link.job.id } },
        });
        const remaining = await prisma.ticketJob.count({
          where: { jobId: link.job.id },
        });
        if (remaining === 0) {
          await prisma.job.update({
            where: { id: link.job.id },
            data: { status: "CANCELLED" },
          });
        }
      }
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
      dispatchHeadsUp,
    },
  });

  const headsUp =
    dispatchHeadsUp.length > 0
      ? ` Heads-up: ${dispatchHeadsUp.join(", ")} ${dispatchHeadsUp.length === 1 ? "is" : "are"} on a scheduled route — tell dispatch the device is already here.`
      : "";
  const summary =
    transitioned > 0
      ? `${scanLabel}: moved ${transitioned}/${candidates.length} to In warehouse${
          skipped.length > 0 ? ` (${skipped.length} skipped)` : ""
        }.${headsUp}`
      : `${scanLabel}: nothing moved — ${skipped.join("; ")}`;
  revalidatePath("/scan/warehouse");
  revalidatePath("/tickets");
  redirect(
    `/scan/warehouse?${transitioned > 0 ? "ok" : "error"}=${encodeURIComponent(summary)}`,
  );
}

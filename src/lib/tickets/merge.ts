/**
 * Ticket merge.
 *
 * Soft merge: the source ticket gets `mergedIntoTicketId = target`
 * and a comment pointing at the target; the target also gets a
 * comment noting the merge. The source's state is moved to CLOSED
 * so it stops showing up in active queues, but its history
 * (events, attachments, comments, time entries, parts usages) is
 * preserved on its own row. The ticket detail page shows a banner
 * on either row that links to the other.
 *
 * This is deliberately less ambitious than "move all data from
 * source to target and delete source": moving rows is easy to get
 * wrong under RLS-style referential integrity, and ops can always
 * look at the source row for the original evidence.
 *
 * Round-7 §1A — when the source has device(s) attached via
 * RouteStopDevice (the on-route +Add device flow), those rows
 * re-point at the survivor INSIDE THE SAME TRANSACTION so a route
 * stop card no longer shows the dead synthetic. Policy:
 *
 *   - Survivor's `Ticket.deviceId` (single-device shorthand) is
 *     filled from the source ONLY when the survivor has none.
 *     Otherwise the survivor's existing device wins and the source's
 *     device is just listed in the audit + merge comment.
 *   - All `StopDevice.ticketId` rows that point at source are
 *     re-pointed at target. This is the source-of-truth ledger
 *     for "which devices showed up on this ticket via a route".
 *   - One `Ticket.device.transferred` audit row per transferred
 *     device with `before.fromTicketId` + `after.toTicketId`.
 *   - The merge comment on the survivor lists the transferred
 *     devices ("Devices transferred: SN-X (Acer Chromebook 511)").
 *
 * See `docs/round-7-assumptions.md` for the schema choice rationale.
 */

import type { PrismaClient, Ticket } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

export interface MergeTicketInput {
  sourceTicketId: string;
  targetTicketId: string;
  actorUserId: string;
  reason?: string | null;
}

export async function mergeTicket(
  input: MergeTicketInput,
  db: PrismaClient = defaultPrisma,
): Promise<{ source: Ticket; target: Ticket; devicesTransferred: number }> {
  if (input.sourceTicketId === input.targetTicketId) {
    throw new Error("Cannot merge a ticket into itself");
  }

  return db.$transaction(async (tx) => {
    const source = await tx.ticket.findUnique({
      where: { id: input.sourceTicketId },
    });
    const target = await tx.ticket.findUnique({
      where: { id: input.targetTicketId },
    });
    if (!source) throw new Error("Source ticket not found");
    if (!target) throw new Error("Target ticket not found");
    if (source.mergedIntoTicketId) {
      throw new Error("Source ticket is already merged");
    }
    if (target.mergedIntoTicketId) {
      throw new Error("Target ticket is already merged into another ticket");
    }

    // Round-7 §1A — collect every StopDevice row currently pointing
    // at the source so we can re-point + audit + describe in the
    // survivor's merge comment. We include the device + model so the
    // comment reads as "SN-X (Acer Chromebook 511)" without a
    // second roundtrip.
    const stopDevices = await tx.stopDevice.findMany({
      where: { ticketId: source.id, removedAt: null },
      include: {
        device: {
          select: {
            id: true,
            serialNumber: true,
            assetTag: true,
            model: { select: { manufacturer: true, modelName: true } },
          },
        },
      },
    });

    const now = new Date();

    // If the survivor has no device pinned, fill it from the source's
    // primary device (the one the synthetic carried). When the
    // survivor already has a device, we leave it alone — the route
    // ledger still captures the transferred device(s).
    const surviorDevicePromotion =
      target.deviceId == null && source.deviceId != null
        ? { deviceId: source.deviceId }
        : {};

    const updatedSource = await tx.ticket.update({
      where: { id: source.id },
      data: {
        mergedIntoTicketId: target.id,
        state: "CLOSED",
        stateEnteredAt: now,
        closedAt: now,
      },
    });

    if (Object.keys(surviorDevicePromotion).length > 0) {
      await tx.ticket.update({
        where: { id: target.id },
        data: surviorDevicePromotion,
      });
    }

    if (stopDevices.length > 0) {
      await tx.stopDevice.updateMany({
        where: { ticketId: source.id, removedAt: null },
        data: { ticketId: target.id },
      });
    }

    const reasonSuffix = input.reason ? `: ${input.reason}` : "";
    const deviceList = stopDevices
      .map((sd) => {
        const id = sd.device.assetTag ?? sd.device.serialNumber;
        const model = sd.device.model
          ? ` (${sd.device.model.manufacturer} ${sd.device.model.modelName})`
          : "";
        return `${id}${model}`;
      })
      .join(", ");
    const transferSuffix = deviceList
      ? `\n\nDevices transferred: ${deviceList}`
      : "";

    await tx.comment.create({
      data: {
        ticketId: source.id,
        authorUserId: input.actorUserId,
        body: `This ticket was merged into ${target.incidentNumber}${reasonSuffix}. See the target for the ongoing record.${transferSuffix}`,
      },
    });
    await tx.comment.create({
      data: {
        ticketId: target.id,
        authorUserId: input.actorUserId,
        body: `Ticket ${source.incidentNumber} was merged into this one${reasonSuffix}.${transferSuffix}`,
      },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: source.id,
        fromState: source.state,
        toState: "CLOSED",
        actorUserId: input.actorUserId,
        reason: `Merged into ${target.incidentNumber}`,
        payload: { mergedIntoTicketId: target.id },
      },
    });

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Ticket",
        entityId: source.id,
        action: "merge",
        before: { state: source.state, mergedIntoTicketId: null },
        after: {
          state: "CLOSED",
          mergedIntoTicketId: target.id,
          targetIncident: target.incidentNumber,
          devicesTransferred: stopDevices.length,
        },
      },
      tx,
    );

    // Round-7 §1A — one audit row per transferred device on the
    // SURVIVOR's entity so /admin/audit shows "Ticket.device.transferred"
    // with from/to ticket ids in the diff.
    for (const sd of stopDevices) {
      await writeAudit(
        {
          actorUserId: input.actorUserId,
          entityType: "Ticket",
          entityId: target.id,
          action: "device.transferred",
          before: {
            fromTicketId: source.id,
            fromIncident: source.incidentNumber,
            stopDeviceId: sd.id,
          },
          after: {
            toTicketId: target.id,
            toIncident: target.incidentNumber,
            deviceId: sd.device.id,
            serialNumber: sd.device.serialNumber,
          },
          reason: `Device ${sd.device.assetTag ?? sd.device.serialNumber} transferred from ${source.incidentNumber} on merge`,
        },
        tx,
      );
    }

    return {
      source: updatedSource,
      target,
      devicesTransferred: stopDevices.length,
    };
  });
}

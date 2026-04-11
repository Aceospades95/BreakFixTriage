/**
 * Manufacturer RMA service.
 *
 * When a device is shipped back to the vendor for warranty repair,
 * the ticket sits in MANUFACTURER_RMA. This module records the
 * paperwork — RMA number, vendor, tracking numbers, shipped/received
 * dates — so ops can answer "where's our stuff?" without digging
 * through email.
 *
 * The ticket state machine already knows about MANUFACTURER_RMA; we
 * just attach structured data to it. Create → ship → receive is a
 * soft lifecycle; we don't refuse out-of-order updates because
 * real-world RMAs get messy.
 */

import type { ManufacturerRma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

export interface CreateRmaInput {
  ticketId: string;
  rmaNumber: string;
  vendor: string;
  trackingOut?: string | null;
  notes?: string | null;
  actorUserId: string;
}

export async function createRma(
  input: CreateRmaInput,
  db: PrismaClient = defaultPrisma,
): Promise<ManufacturerRma> {
  return db.$transaction(async (tx) => {
    const rma = await tx.manufacturerRma.create({
      data: {
        ticketId: input.ticketId,
        rmaNumber: input.rmaNumber,
        vendor: input.vendor,
        trackingOut: input.trackingOut ?? null,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "ManufacturerRma",
        entityId: rma.id,
        action: "create",
        after: {
          ticketId: input.ticketId,
          rmaNumber: input.rmaNumber,
          vendor: input.vendor,
        },
      },
      tx,
    );
    return rma;
  });
}

export interface MarkShippedInput {
  rmaId: string;
  trackingOut?: string | null;
  actorUserId: string;
}

export async function markRmaShipped(
  input: MarkShippedInput,
  db: PrismaClient = defaultPrisma,
): Promise<ManufacturerRma> {
  return db.$transaction(async (tx) => {
    const rma = await tx.manufacturerRma.update({
      where: { id: input.rmaId },
      data: {
        shippedAt: new Date(),
        trackingOut: input.trackingOut ?? undefined,
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "ManufacturerRma",
        entityId: rma.id,
        action: "ship",
        after: {
          shippedAt: rma.shippedAt?.toISOString() ?? null,
          trackingOut: rma.trackingOut ?? null,
        },
      },
      tx,
    );
    return rma;
  });
}

export interface MarkReceivedInput {
  rmaId: string;
  trackingIn?: string | null;
  notes?: string | null;
  actorUserId: string;
}

export async function markRmaReceived(
  input: MarkReceivedInput,
  db: PrismaClient = defaultPrisma,
): Promise<ManufacturerRma> {
  return db.$transaction(async (tx) => {
    const rma = await tx.manufacturerRma.update({
      where: { id: input.rmaId },
      data: {
        receivedAt: new Date(),
        trackingIn: input.trackingIn ?? undefined,
        notes: input.notes ?? undefined,
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "ManufacturerRma",
        entityId: rma.id,
        action: "receive",
        after: {
          receivedAt: rma.receivedAt?.toISOString() ?? null,
          trackingIn: rma.trackingIn ?? null,
        },
      },
      tx,
    );
    return rma;
  });
}

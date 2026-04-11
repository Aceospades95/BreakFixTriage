/**
 * Parts inventory service.
 *
 * Every change to `Part.onHand` goes through `applyPartMovement` so
 * the running total and the movement log stay in lockstep. Direct
 * writes to `onHand` are a footgun and shouldn't happen outside
 * this module.
 *
 * The five movement kinds cover every real-world stock change:
 *
 *   RECEIVED    — supplier delivery, delta positive
 *   CONSUMED    — used on a repair, delta negative
 *   ADJUSTMENT  — manual correction (audit/cycle count), any sign
 *   RETURNED    — returned to supplier, delta negative
 *   SCRAPPED    — damaged/lost, delta negative
 *
 * `recordPartUsage` is a thin wrapper that writes both a PartUsage
 * row (for the ticket detail page) and a CONSUMED movement (for the
 * log) in one transaction, so ticket-scoped parts tracking stays
 * consistent with the overall stock position.
 */

import {
  PartMovementKind,
  type PrismaClient,
  type Part,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Normalize a user-facing quantity into a signed delta. Kept as a
 * pure function so it is unit-testable without a DB.
 */
export function signedQuantity(
  kind: PartMovementKind,
  rawQuantity: number,
): number {
  const abs = Math.abs(Math.floor(rawQuantity));
  switch (kind) {
    case PartMovementKind.RECEIVED:
      return abs;
    case PartMovementKind.CONSUMED:
    case PartMovementKind.RETURNED:
    case PartMovementKind.SCRAPPED:
      return -abs;
    case PartMovementKind.ADJUSTMENT:
      // Adjustments are the only kind where the sign matters — the
      // caller supplies positive or negative directly.
      return Math.floor(rawQuantity);
  }
}

/**
 * Pure predicate: would the given movement drive onHand negative?
 * Separated from the runner so tests and the UI can both ask the
 * question without hitting the DB.
 */
export function wouldGoNegative(
  currentOnHand: number,
  kind: PartMovementKind,
  rawQuantity: number,
): boolean {
  return currentOnHand + signedQuantity(kind, rawQuantity) < 0;
}

export interface ApplyMovementInput {
  partId: string;
  kind: PartMovementKind;
  quantity: number;
  ticketId?: string | null;
  actorUserId: string | null;
  reason?: string | null;
  /** Allow negative onHand (e.g. ops know stock is actually wrong). */
  allowNegative?: boolean;
}

/**
 * Apply a movement. Updates `Part.onHand`, writes a PartMovement
 * row, and audits the whole thing. Runs inside a single transaction.
 */
export async function applyPartMovement(
  input: ApplyMovementInput,
  db: PrismaClient = defaultPrisma,
): Promise<{ part: Part; movementId: string }> {
  const delta = signedQuantity(input.kind, input.quantity);

  return db.$transaction(async (tx) => {
    const part = await tx.part.findUnique({ where: { id: input.partId } });
    if (!part) throw new Error(`Part ${input.partId} not found`);
    if (!part.active) {
      throw new Error(`Part ${part.sku} is retired`);
    }
    if (!input.allowNegative && part.onHand + delta < 0) {
      throw new Error(
        `Not enough stock for ${part.sku}: onHand=${part.onHand}, delta=${delta}`,
      );
    }

    const movement = await tx.partMovement.create({
      data: {
        partId: part.id,
        kind: input.kind,
        quantity: delta,
        ticketId: input.ticketId ?? null,
        userId: input.actorUserId,
        reason: input.reason ?? null,
      },
    });

    const updated = await tx.part.update({
      where: { id: part.id },
      data: { onHand: part.onHand + delta },
    });

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Part",
        entityId: part.id,
        action: `movement:${input.kind.toLowerCase()}`,
        before: { onHand: part.onHand },
        after: {
          onHand: updated.onHand,
          delta,
          ticketId: input.ticketId ?? null,
          reason: input.reason ?? null,
        },
      },
      tx,
    );

    return { part: updated, movementId: movement.id };
  });
}

export interface RecordPartUsageInput {
  ticketId: string;
  partId: string;
  quantity: number;
  actorUserId: string;
  reason?: string | null;
}

/**
 * Record that a tech used N of a part on a ticket. Creates a
 * PartUsage row (for the ticket detail parts panel) and applies a
 * CONSUMED movement (for the stock log). Runs in one transaction so
 * the two views of the world never drift.
 */
export async function recordPartUsage(
  input: RecordPartUsageInput,
  db: PrismaClient = defaultPrisma,
) {
  if (input.quantity <= 0) {
    throw new Error("quantity must be positive");
  }
  return db.$transaction(async (tx) => {
    const part = await tx.part.findUnique({ where: { id: input.partId } });
    if (!part) throw new Error(`Part ${input.partId} not found`);
    if (part.onHand - input.quantity < 0) {
      throw new Error(
        `Not enough stock for ${part.sku}: onHand=${part.onHand}, need=${input.quantity}`,
      );
    }

    await tx.partUsage.create({
      data: {
        ticketId: input.ticketId,
        partId: input.partId,
        quantity: input.quantity,
      },
    });

    await tx.partMovement.create({
      data: {
        partId: input.partId,
        kind: PartMovementKind.CONSUMED,
        quantity: -input.quantity,
        ticketId: input.ticketId,
        userId: input.actorUserId,
        reason: input.reason ?? null,
      },
    });

    await tx.part.update({
      where: { id: part.id },
      data: { onHand: part.onHand - input.quantity },
    });

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Part",
        entityId: part.id,
        action: "usage",
        after: {
          ticketId: input.ticketId,
          quantity: input.quantity,
          onHand: part.onHand - input.quantity,
        },
      },
      tx,
    );
  });
}

/**
 * Parts that are at or below their reorder level and need a purchase
 * order. Used by the parts dashboard and the daily digest.
 */
export async function partsNeedingReorder(
  db: PrismaClient = defaultPrisma,
) {
  return db.part.findMany({
    where: {
      active: true,
      reorderLevel: { gt: 0 },
    },
    orderBy: { onHand: "asc" },
  }).then((rows) => rows.filter((p) => p.onHand <= p.reorderLevel));
}

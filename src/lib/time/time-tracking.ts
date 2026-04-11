/**
 * Time tracking service.
 *
 * A tech starts a timer on a ticket, works, and stops it. Each
 * start/stop pair becomes a TimeEntry row. On stop we compute and
 * persist `minutes` so the productivity dashboard can sum without
 * re-reading raw timestamps.
 *
 * Hard rule: at most one *open* timer (endedAt IS NULL) per user
 * at a time. Starting a second timer while one is still running
 * auto-stops the previous one first — this matches the real-world
 * expectation that "when I clock in on a new ticket, the old one
 * clocks out." Enforced in the runner, not the schema, because a
 * partial unique index would require raw SQL.
 */

import type { PrismaClient, TimeEntry } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Pure helper: given a start and end Date, return the wall-clock
 * minutes rounded to the nearest minute. Clamps negative durations
 * to 0 so clock skew never produces a negative `minutes` column.
 */
export function computeMinutes(startedAt: Date, endedAt: Date): number {
  const diffMs = endedAt.getTime() - startedAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.round(diffMs / 60_000);
}

export interface StartTimerInput {
  ticketId: string;
  userId: string;
  notes?: string | null;
}

/**
 * Start a new timer. Auto-stops any previous open timer for the
 * same user first so we never leak open intervals.
 */
export async function startTimer(
  input: StartTimerInput,
  db: PrismaClient = defaultPrisma,
): Promise<TimeEntry> {
  return db.$transaction(async (tx) => {
    // Stop any existing open timer for this user.
    const open = await tx.timeEntry.findFirst({
      where: { userId: input.userId, endedAt: null },
    });
    if (open) {
      const now = new Date();
      const minutes = computeMinutes(open.startedAt, now);
      await tx.timeEntry.update({
        where: { id: open.id },
        data: { endedAt: now, minutes },
      });
      await writeAudit(
        {
          actorUserId: input.userId,
          entityType: "TimeEntry",
          entityId: open.id,
          action: "auto-stop",
          after: { minutes, reason: "started new timer" },
        },
        tx,
      );
    }

    const row = await tx.timeEntry.create({
      data: {
        ticketId: input.ticketId,
        userId: input.userId,
        startedAt: new Date(),
        notes: input.notes ?? null,
      },
    });
    await writeAudit(
      {
        actorUserId: input.userId,
        entityType: "TimeEntry",
        entityId: row.id,
        action: "start",
        after: { ticketId: input.ticketId },
      },
      tx,
    );
    return row;
  });
}

export interface StopTimerInput {
  entryId: string;
  userId: string;
  notes?: string | null;
}

export async function stopTimer(
  input: StopTimerInput,
  db: PrismaClient = defaultPrisma,
): Promise<TimeEntry> {
  return db.$transaction(async (tx) => {
    const entry = await tx.timeEntry.findUnique({
      where: { id: input.entryId },
    });
    if (!entry) throw new Error(`TimeEntry ${input.entryId} not found`);
    if (entry.userId !== input.userId) {
      throw new Error("You can only stop your own timer");
    }
    if (entry.endedAt != null) return entry;

    const now = new Date();
    const minutes = computeMinutes(entry.startedAt, now);
    const updated = await tx.timeEntry.update({
      where: { id: entry.id },
      data: {
        endedAt: now,
        minutes,
        notes: input.notes ?? entry.notes,
      },
    });
    await writeAudit(
      {
        actorUserId: input.userId,
        entityType: "TimeEntry",
        entityId: entry.id,
        action: "stop",
        after: { minutes },
      },
      tx,
    );
    return updated;
  });
}

/**
 * Sum total minutes logged on a single ticket. Fast thanks to the
 * denormalized `minutes` column on the row.
 */
export async function totalMinutesForTicket(
  ticketId: string,
  db: PrismaClient = defaultPrisma,
): Promise<number> {
  const rows = await db.timeEntry.findMany({
    where: { ticketId, endedAt: { not: null } },
    select: { minutes: true },
  });
  return rows.reduce((a, r) => a + (r.minutes ?? 0), 0);
}

/**
 * Find a user's currently-open timer, if any. Used by the ticket
 * detail panel to decide whether to render "Start timer" or
 * "Stop timer" for the signed-in user.
 */
export async function openTimerForUser(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.timeEntry.findFirst({
    where: { userId, endedAt: null },
    include: {
      ticket: { select: { id: true, incidentNumber: true } },
    },
  });
}

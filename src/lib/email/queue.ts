/**
 * DB-backed email job queue.
 *
 * Round-2 §3. We deliberately do not pull in Redis / pg-boss /
 * BullMQ here. The email volume is small (a few hundred sends a
 * day in steady state), the deploy target is constrained
 * (Unraid container; long-running workers may or may not be
 * available — see ADR 0007), and Postgres can do row-level locks
 * just fine for this size.
 *
 * Worker contract (scripts/email-worker.ts):
 *
 *   1. Poll every ~2 seconds.
 *   2. `claim()` selects the next due unlocked pending job, locks
 *      it via `update where lockedAt IS NULL`. Postgres row locks
 *      mean two workers racing won't both win.
 *   3. Worker calls `dispatch(job)` (in send.ts), which sends and
 *      updates the matching EmailLog.
 *   4. On success, `complete(job)`. On failure, `fail(job, retry?)`
 *      with exponential backoff: 1m, 5m, 30m, 2h, then dead-letter
 *      (status = 'failed' and lastError set).
 *
 * Idempotency: if the worker crashes after the provider acknowledged
 * but before `complete` ran, the lock release lets a peer re-claim
 * — but the EmailLog row will already have a providerMessageId, so
 * `dispatch` skips duplicate sends.
 */

import { EmailJobStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

const BACKOFF_MINUTES = [1, 5, 30, 120]; // 1m, 5m, 30m, 2h
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
const LOCK_STALE_MINUTES = 10;

export interface QueueJob {
  id: string;
  templateKey: string;
  payload: Record<string, unknown>;
  emailLogId: string | null;
  attempts: number;
}

/**
 * Enqueue a new job. The caller has already written the EmailLog
 * row in `queued` status — this function just registers the work
 * for the worker to pick up.
 */
export async function enqueue(
  input: {
    templateKey: string;
    payload: Record<string, unknown>;
    emailLogId?: string | null;
    runAt?: Date;
  },
  db: PrismaClient = defaultPrisma,
): Promise<{ id: string }> {
  const job = await db.emailJob.create({
    data: {
      templateKey: input.templateKey,
      payload: input.payload as unknown as Prisma.InputJsonValue,
      emailLogId: input.emailLogId ?? null,
      nextRunAt: input.runAt ?? new Date(),
    },
    select: { id: true },
  });
  return job;
}

/**
 * Atomically claim the next due unlocked pending job. Returns null
 * when the queue is empty. The lock is taken inside a transaction
 * with `where lockedAt IS NULL` so two parallel workers can race
 * safely — exactly one wins.
 */
export async function claim(
  workerId: string,
  db: PrismaClient = defaultPrisma,
): Promise<QueueJob | null> {
  const now = new Date();
  // Step 1: find a candidate that's due. We don't lock here; the
  // update in step 2 is the actual lock acquisition.
  const candidate = await db.emailJob.findFirst({
    where: {
      status: EmailJobStatus.pending,
      nextRunAt: { lte: now },
      OR: [
        { lockedAt: null },
        // Re-claim a lock that's been held too long (worker crashed).
        {
          lockedAt: {
            lt: new Date(now.getTime() - LOCK_STALE_MINUTES * 60 * 1000),
          },
        },
      ],
    },
    orderBy: { nextRunAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return null;

  // Step 2: claim. updateMany with the same lockedAt-null guard so
  // a peer that found the same candidate doesn't end up with the
  // job too.
  const claimed = await db.emailJob.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { lockedAt: null },
        {
          lockedAt: {
            lt: new Date(now.getTime() - LOCK_STALE_MINUTES * 60 * 1000),
          },
        },
      ],
      status: EmailJobStatus.pending,
    },
    data: {
      status: EmailJobStatus.running,
      lockedAt: now,
      lockedBy: workerId,
    },
  });
  if (claimed.count === 0) return null;

  const job = await db.emailJob.findUnique({ where: { id: candidate.id } });
  if (!job) return null;
  return {
    id: job.id,
    templateKey: job.templateKey,
    payload: (job.payload ?? {}) as Record<string, unknown>,
    emailLogId: job.emailLogId,
    attempts: job.attempts,
  };
}

export async function complete(
  jobId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.emailJob.update({
    where: { id: jobId },
    data: {
      status: EmailJobStatus.done,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/**
 * Mark a failure. If retries remain, push nextRunAt out by the
 * exponential backoff curve and put the job back to pending.
 * Otherwise dead-letter (status=failed, lastError set, lockedAt
 * cleared so it doesn't block the queue).
 */
export async function fail(
  jobId: string,
  error: string,
  db: PrismaClient = defaultPrisma,
): Promise<{ deadLettered: boolean; nextRunAt: Date | null }> {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { deadLettered: true, nextRunAt: null };
  }
  const nextAttempt = job.attempts + 1;
  if (nextAttempt > MAX_ATTEMPTS) {
    await db.emailJob.update({
      where: { id: jobId },
      data: {
        status: EmailJobStatus.failed,
        attempts: nextAttempt,
        lockedAt: null,
        lockedBy: null,
        lastError: error,
      },
    });
    return { deadLettered: true, nextRunAt: null };
  }
  const backoffMs = BACKOFF_MINUTES[nextAttempt - 1]! * 60 * 1000;
  const nextRunAt = new Date(Date.now() + backoffMs);
  await db.emailJob.update({
    where: { id: jobId },
    data: {
      status: EmailJobStatus.pending,
      attempts: nextAttempt,
      nextRunAt,
      lockedAt: null,
      lockedBy: null,
      lastError: error,
    },
  });
  return { deadLettered: false, nextRunAt };
}

/** Re-export for tests + the worker. */
export const __INTERNAL = { BACKOFF_MINUTES, MAX_ATTEMPTS, LOCK_STALE_MINUTES };

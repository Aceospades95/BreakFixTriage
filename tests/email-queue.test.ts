import { describe, it, expect, vi } from "vitest";
import { fail } from "@/lib/email/queue";

/**
 * Round-2 §3 — exponential backoff curve for the email queue.
 *
 * Tests use a hand-rolled prisma mock — the failure path is the
 * one with the most logic (computing the next run timestamp +
 * dead-lettering after MAX_ATTEMPTS).
 */

interface FakeJob {
  id: string;
  attempts: number;
  status: string;
  nextRunAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
}

function makeDb(initial: FakeJob) {
  let job = { ...initial };
  return {
    db: {
      emailJob: {
        findUnique: vi.fn(async () => job),
        update: vi.fn(async (args: { data: Partial<FakeJob> }) => {
          job = { ...job, ...args.data } as FakeJob;
          return job;
        }),
      },
    } as unknown as Parameters<typeof fail>[2],
    get current() {
      return job;
    },
  };
}

describe("queue.fail — backoff and dead-letter", () => {
  it("first failure schedules retry ~1 minute out", async () => {
    const env = makeDb({
      id: "j1",
      attempts: 0,
      status: "pending",
      nextRunAt: new Date(),
      lockedAt: new Date(),
      lockedBy: "w1",
      lastError: null,
    });
    const before = Date.now();
    const result = await fail("j1", "transient", env.db);
    expect(result.deadLettered).toBe(false);
    expect(result.nextRunAt!.getTime()).toBeGreaterThanOrEqual(
      before + 60 * 1000 - 50,
    );
    expect(env.current.attempts).toBe(1);
    expect(env.current.lockedAt).toBeNull();
  });

  it("dead-letters after MAX_ATTEMPTS", async () => {
    const env = makeDb({
      id: "j2",
      attempts: 4, // already at the limit
      status: "running",
      nextRunAt: new Date(),
      lockedAt: new Date(),
      lockedBy: "w1",
      lastError: "previous",
    });
    const result = await fail("j2", "permanent", env.db);
    expect(result.deadLettered).toBe(true);
    expect(env.current.status).toBe("failed");
    expect(env.current.attempts).toBe(5);
    expect(env.current.lastError).toBe("permanent");
  });

  it("returns deadLettered for a missing job", async () => {
    const db = {
      emailJob: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
      },
    } as unknown as Parameters<typeof fail>[2];
    const result = await fail("missing", "x", db);
    expect(result.deadLettered).toBe(true);
    expect(result.nextRunAt).toBeNull();
  });
});

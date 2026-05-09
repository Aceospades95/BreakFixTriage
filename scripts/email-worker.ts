/**
 * Long-running email worker.
 *
 * Round-2 §3. Polls the EmailJob table at 2s intervals, claims one
 * job at a time, dispatches it through the configured provider,
 * marks the matching EmailLog row as sent / failed, and loops.
 *
 * Run locally:
 *
 *   npm run email:worker
 *
 * Production: deploy as a sidecar process that restarts on exit. If
 * the deploy target can't host a long-running worker (Vercel free
 * tier, some Unraid setups), wrap this with a cron poll instead —
 * `* * * * * timeout 30 npm run email:worker` runs the loop for at
 * most 30s every minute. ADR 0007 captures the choice.
 *
 * The worker is single-process by design (one row at a time). For
 * higher throughput, run multiple workers — the queue claims via
 * lockedAt-null so two workers won't collide.
 *
 * Graceful shutdown: SIGTERM completes the in-flight job, then
 * exits 0. SIGINT is treated the same.
 */

import { hostname } from "node:os";
import { prisma } from "../src/lib/db/prisma";
import { claim, processEmailJob } from "../src/lib/email";

const POLL_INTERVAL_MS = 2_000;
const WORKER_ID = `${hostname()}:${process.pid}`;

let stopping = false;

function onShutdown(signal: string) {
  if (stopping) return;
  console.log(`[email-worker] ${signal} received, finishing current job…`);
  stopping = true;
}
process.on("SIGTERM", () => onShutdown("SIGTERM"));
process.on("SIGINT", () => onShutdown("SIGINT"));

async function loop() {
  console.log(
    `[email-worker] starting ${WORKER_ID}, polling every ${POLL_INTERVAL_MS}ms`,
  );
  while (!stopping) {
    try {
      const job = await claim(WORKER_ID, prisma);
      if (job) {
        const startedAt = Date.now();
        await processEmailJob(job, prisma);
        console.log(
          `[email-worker] processed job=${job.id} template=${job.templateKey} in ${Date.now() - startedAt}ms`,
        );
        // Tight loop while there's pending work — only sleep when
        // idle.
        continue;
      }
    } catch (err) {
      console.error("[email-worker] poll error:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

loop()
  .catch((err) => {
    console.error("[email-worker] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("[email-worker] shut down cleanly");
  });

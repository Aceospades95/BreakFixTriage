/**
 * Escalation sweeper entrypoint.
 *
 *   npx tsx prisma/escalate-stale.ts
 *
 * Run daily (or more frequently) from a cron or Unraid User Script.
 * Prints a JSON summary and exits 0 on success, 1 on any unexpected
 * error. Notifications written by the sweep show up in the in-app
 * bell for assignees, admins, and ops managers.
 */

import { prisma } from "../src/lib/db/prisma";
import { sweepEscalations } from "../src/lib/escalation/sweep";

async function main() {
  const report = await sweepEscalations({ actorUserId: null });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Hold-window sweeper entrypoint.
 *
 * Run this on a schedule (cron, systemd timer, Unraid User Scripts,
 * whatever) to auto-expire any SENT quote whose hold window has passed:
 *
 *   npx tsx prisma/sweep-quotes.ts
 *
 * The script reports counts on stdout and exits 0 on success, 1 on
 * error. Every expired quote is written with the NULL actor (null =
 * system) so the audit log clearly distinguishes automated expiries
 * from manual ones.
 */

import { prisma } from "../src/lib/db/prisma";
import { sweepExpiredQuotes } from "../src/lib/quotes";

async function main() {
  const report = await sweepExpiredQuotes({ actorUserId: null });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

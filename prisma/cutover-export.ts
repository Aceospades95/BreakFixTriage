/**
 * Cutover export entrypoint.
 *
 *   npx tsx prisma/cutover-export.ts > cutover-YYYY-MM-DD.csv
 *
 * Writes the full ticket table to stdout as CSV in a format that the
 * legacy spreadsheet team can review side-by-side with their
 * existing tabs. Intended to run once at the start of the
 * parallel-run week and once more on cutover day as the canonical
 * snapshot.
 */

import { prisma } from "../src/lib/db/prisma";
import { exportAllTicketsCsv } from "../src/lib/cutover";

async function main() {
  const csv = await exportAllTicketsCsv();
  process.stdout.write(csv);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

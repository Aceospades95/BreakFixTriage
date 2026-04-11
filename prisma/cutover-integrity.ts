/**
 * Integrity scan entrypoint.
 *
 *   npx tsx prisma/cutover-integrity.ts
 *
 * Exits 0 when zero issues are found, 1 otherwise. Run this as the
 * last gate before flipping READ_ONLY_MODE off on cutover morning.
 */

import { prisma } from "../src/lib/db/prisma";
import { runIntegrityScan } from "../src/lib/cutover";

async function main() {
  const report = await runIntegrityScan();
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length > 0) {
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

/**
 * One-shot data fix: flag schools whose addresses look placeholder-ish.
 *
 * Round-2 §7. Sets `School.needsAddress = true` on every school whose
 * line1 matches the legacy seed pattern (`11X101 Address Line`) or
 * whose Address row has null lat/lng.
 *
 * Idempotent: re-running on a populated DB leaves real addresses
 * alone and only re-flags placeholders. Toggles `needsAddress = false`
 * on schools whose address has since been geocoded.
 *
 *   npx tsx scripts/fix-school-addresses.ts
 *   npx tsx scripts/fix-school-addresses.ts --dry-run
 *
 * Output: a count of schools flagged + a count cleared. Exit 0 on
 * success, 1 if any school's address row was unexpectedly missing.
 */

import { prisma } from "../src/lib/db/prisma";

const PLACEHOLDER_LINE1 = /^[0-9X]+\s+Address\s+Line\b/i;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const schools = await prisma.school.findMany({
    include: { address: true },
  });

  let flagged = 0;
  let cleared = 0;
  let missing = 0;

  for (const school of schools) {
    const addr = school.address;
    const placeholder =
      addr === null ||
      PLACEHOLDER_LINE1.test(addr.line1) ||
      addr.latitude == null ||
      addr.longitude == null;

    if (placeholder && !school.needsAddress) {
      flagged++;
      if (!dryRun) {
        await prisma.school.update({
          where: { id: school.id },
          data: { needsAddress: true },
        });
      }
      console.log(
        `[flag] ${school.code ?? school.id} ${school.name}` +
          (addr === null ? " (no address row)" : ""),
      );
      if (addr === null) missing++;
    } else if (!placeholder && school.needsAddress) {
      cleared++;
      if (!dryRun) {
        await prisma.school.update({
          where: { id: school.id },
          data: { needsAddress: false },
        });
      }
      console.log(
        `[clear] ${school.code ?? school.id} ${school.name}`,
      );
    }
  }

  console.log(
    `\nSummary: ${flagged} flagged, ${cleared} cleared, ${missing} no-address.${
      dryRun ? " (dry-run)" : ""
    }`,
  );

  // Exit non-zero if there are schools without any Address row at all
  // — those are stuck, and the script can't geocode without text.
  if (missing > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

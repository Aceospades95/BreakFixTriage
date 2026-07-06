/**
 * QA audit BUG-3 — data repair for approvals the hold sweep wrongly
 * expired. Thin CLI over src/lib/quotes/repair.ts (see that file for
 * the matcher's definition and its Round-5 history).
 *
 * DRY RUN by default — prints what it would change and exits.
 * Run with --apply to write:
 *
 *   npx tsx scripts/repair-consumed-quote-approvals.ts           # inspect
 *   npx tsx scripts/repair-consumed-quote-approvals.ts --apply   # fix
 *
 * Every restoration writes a QuoteActivity (kind "repair") and an
 * AuditLog row, so the correction itself is on the record.
 */
import { PrismaClient } from "@prisma/client";
import {
  findClobberedApprovals,
  repairClobberedApprovals,
} from "@/lib/quotes/repair";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await findClobberedApprovals(prisma);
  console.log(
    `${rows.length} quote(s) match the sweep-clobbered-approval shape ` +
      `(timeline: Quote approved -> In repair; quote record: NO_RESPONSE).`,
  );
  for (const r of rows) {
    console.log(
      `  ${r.incidentNumber} (${r.ticketState}) — quote ${r.quoteId}: ` +
        `NO_RESPONSE -> APPROVED${APPLY ? "" : " [dry run]"}`,
    );
  }
  if (APPLY && rows.length > 0) {
    const n = await repairClobberedApprovals(rows, prisma);
    console.log(`Repaired ${n} quote(s).`);
  } else if (rows.length > 0) {
    console.log("\nRe-run with --apply to write these repairs.");
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

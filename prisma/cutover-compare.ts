/**
 * Parallel-run comparison entrypoint.
 *
 * Usage:
 *
 *   npx tsx prisma/cutover-compare.ts <path-to-legacy-sheet>
 *
 * The legacy file can be CSV or XLSX and is parsed with the same
 * header-alias mapper the importer uses. Only `incidentNumber` is
 * strictly required on each row; `state`, `schoolCode`, and
 * `serialNumber` are compared when present.
 *
 * The script writes a JSON summary to stdout and exits:
 *
 *   0 — counts match, no drift, no rows missing from either side
 *   1 — any difference (use `| jq .` for a readable report)
 *
 * Intended to run daily during the parallel-run week, wired into
 * whatever alerting you use.
 */

import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/db/prisma";
import { parseFile } from "../src/lib/import/parse";
import { mapRawRow } from "../src/lib/import/mapper";
import type { TicketState } from "@prisma/client";
import {
  compareLegacyToDb,
  type LegacyRow,
  type DbRow,
} from "../src/lib/cutover";

async function loadLegacyRows(filename: string): Promise<LegacyRow[]> {
  const buf = await readFile(filename);
  const parsed = parseFile(filename, buf);
  const rows: LegacyRow[] = [];
  for (const raw of parsed.rows) {
    const { mapped } = mapRawRow(raw);
    if (!mapped.incidentNumber) continue;
    rows.push({
      incidentNumber: mapped.incidentNumber,
      state: stateFromRaw(raw),
      schoolCode: mapped.schoolCode ?? null,
      serialNumber: mapped.serialNumber ?? null,
    });
  }
  return rows;
}

/**
 * Legacy sheets typically have a "Status" or "State" column that
 * doesn't line up 1:1 with our TicketState enum. This helper looks for
 * the common column names and returns null on anything it doesn't
 * recognize, which tells the comparison to skip the field.
 */
function stateFromRaw(
  raw: Record<string, unknown>,
): TicketState | null {
  const keys = Object.keys(raw);
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[\s_-]/g, "");
    if (norm === "state" || norm === "status" || norm === "ticketstate") {
      const value = String(raw[key] ?? "").trim().toUpperCase();
      if (!value) return null;
      // Only accept values that match an enum member verbatim.
      const allowed: TicketState[] = [
        "IMPORTED",
        "TRIAGE",
        "AWAITING_PICKUP",
        "PICKUP_SCHEDULED",
        "IN_WAREHOUSE",
        "DIAGNOSIS",
        "AWAITING_PARTS",
        "PARTS_ORDERED",
        "IN_REPAIR",
        "REPAIR_COMPLETED",
        "AWAITING_ONSITE",
        "ONSITE_IN_PROGRESS",
        "QUOTE_REQUIRED",
        "QUOTE_SENT",
        "QUOTE_APPROVED",
        "QUOTE_DECLINED",
        "QUOTE_NO_RESPONSE",
        "MANUFACTURER_RMA",
        "OUT_OF_SCOPE",
        "PENDING_DELIVERY",
        "DELIVERY_SCHEDULED",
        "RETURNED",
        "INVOICE_REQUIRED",
        "CLOSED",
        "REOPENED",
        "ON_HOLD",
      ];
      if ((allowed as string[]).includes(value)) {
        return value as TicketState;
      }
      return null;
    }
  }
  return null;
}

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error(
      "Usage: npx tsx prisma/cutover-compare.ts <path-to-legacy-sheet.csv|xlsx>",
    );
    process.exit(2);
  }

  const [legacy, dbTickets] = await Promise.all([
    loadLegacyRows(filename),
    prisma.ticket.findMany({
      include: {
        school: { select: { code: true } },
        device: { select: { serialNumber: true } },
      },
    }),
  ]);

  const db: DbRow[] = dbTickets.map((t) => ({
    incidentNumber: t.incidentNumber,
    state: t.state,
    schoolCode: t.school.code,
    serialNumber: t.device?.serialNumber ?? null,
  }));

  const report = compareLegacyToDb(legacy, db);
  console.log(JSON.stringify(report, null, 2));

  const clean =
    report.onlyInLegacy.length === 0 &&
    report.onlyInDb.length === 0 &&
    report.drift.length === 0;
  if (!clean) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Parallel-run comparison.
 *
 * During the cutover period, operations runs the legacy spreadsheet
 * and BreakFix Triage side-by-side. This module reconciles the two
 * sources by joining on incident number and reports every row that
 * is:
 *
 *   - present only in the legacy sheet (still on spreadsheet)
 *   - present only in the new DB (new since last sheet export)
 *   - present in both but with a different ticket state (drift)
 *
 * The comparison is implemented as a pure function over plain objects
 * so it is cheap to unit-test. The database-touching runner that
 * loads both sides and calls this function lives alongside it.
 */

import type { TicketState } from "@prisma/client";

/** Row shape the legacy spreadsheet exports. Only incidentNumber is strictly required. */
export interface LegacyRow {
  incidentNumber: string;
  state?: TicketState | null;
  schoolCode?: string | null;
  serialNumber?: string | null;
}

/** Row shape we select from the BreakFix Triage database. */
export interface DbRow {
  incidentNumber: string;
  state: TicketState;
  schoolCode: string | null;
  serialNumber: string | null;
}

/** One row where both sources agree on the incident but disagree on something. */
export interface DriftRow {
  incidentNumber: string;
  field: "state" | "schoolCode" | "serialNumber";
  legacyValue: string | null;
  dbValue: string | null;
}

export interface ComparisonReport {
  legacyCount: number;
  dbCount: number;
  matched: number;
  onlyInLegacy: string[];
  onlyInDb: string[];
  drift: DriftRow[];
}

/**
 * Canonicalize an incident number for comparison. Trims whitespace and
 * uppercases so that "  inc1234567 " and "INC1234567" collide.
 */
function canon(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * Pure comparison. Callers pre-fetch both sides; this function is
 * synchronous and has no I/O.
 *
 * For rows that appear in both sources we compare:
 *   - state       (always; absent on legacy side → null)
 *   - schoolCode  (only if the legacy side has a non-null value)
 *   - serialNumber (only if the legacy side has a non-null value)
 *
 * A missing value on the legacy side is treated as "no opinion" — we
 * never flag it as drift, since the spreadsheet commonly omits fields
 * that BreakFix Triage tracks precisely.
 */
export function compareLegacyToDb(
  legacy: LegacyRow[],
  db: DbRow[],
): ComparisonReport {
  const legacyMap = new Map<string, LegacyRow>();
  for (const row of legacy) {
    const key = canon(row.incidentNumber);
    if (!key) continue;
    legacyMap.set(key, row);
  }
  const dbMap = new Map<string, DbRow>();
  for (const row of db) {
    const key = canon(row.incidentNumber);
    if (!key) continue;
    dbMap.set(key, row);
  }

  const onlyInLegacy: string[] = [];
  const onlyInDb: string[] = [];
  const drift: DriftRow[] = [];
  let matched = 0;

  for (const [incidentNumber, legacyRow] of legacyMap) {
    const dbRow = dbMap.get(incidentNumber);
    if (!dbRow) {
      onlyInLegacy.push(incidentNumber);
      continue;
    }
    matched += 1;

    if ((legacyRow.state ?? null) !== dbRow.state) {
      drift.push({
        incidentNumber,
        field: "state",
        legacyValue: legacyRow.state ?? null,
        dbValue: dbRow.state,
      });
    }
    if (
      legacyRow.schoolCode &&
      legacyRow.schoolCode.trim() &&
      legacyRow.schoolCode.trim().toUpperCase() !==
        (dbRow.schoolCode ?? "").toUpperCase()
    ) {
      drift.push({
        incidentNumber,
        field: "schoolCode",
        legacyValue: legacyRow.schoolCode,
        dbValue: dbRow.schoolCode,
      });
    }
    if (
      legacyRow.serialNumber &&
      legacyRow.serialNumber.trim() &&
      legacyRow.serialNumber.trim().toUpperCase() !==
        (dbRow.serialNumber ?? "").toUpperCase()
    ) {
      drift.push({
        incidentNumber,
        field: "serialNumber",
        legacyValue: legacyRow.serialNumber,
        dbValue: dbRow.serialNumber,
      });
    }
  }

  for (const incidentNumber of dbMap.keys()) {
    if (!legacyMap.has(incidentNumber)) {
      onlyInDb.push(incidentNumber);
    }
  }

  onlyInLegacy.sort();
  onlyInDb.sort();
  drift.sort((a, b) => a.incidentNumber.localeCompare(b.incidentNumber));

  return {
    legacyCount: legacyMap.size,
    dbCount: dbMap.size,
    matched,
    onlyInLegacy,
    onlyInDb,
    drift,
  };
}

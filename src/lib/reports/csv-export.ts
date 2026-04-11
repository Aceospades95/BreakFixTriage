/**
 * Generic CSV formatter used by the "Export CSV" buttons on the
 * tickets, quotes, invoices, and audit-log list pages.
 *
 * Keep this pure and framework-free so it can be covered by unit
 * tests without a DB. Each list page has a thin server action that
 * fetches the rows for the current filter set and hands them to
 * `rowsToCsv()` with a field selector.
 */

import { csvEscape } from "@/lib/cutover/export";

export interface CsvColumn<Row> {
  header: string;
  /**
   * Value extractor. Return any primitive or Date — the formatter
   * will stringify and escape for you. Return null or undefined for
   * an empty cell.
   */
  get: (row: Row) => string | number | boolean | Date | null | undefined;
}

/**
 * Render an array of rows as a CSV string.
 *
 *   const csv = rowsToCsv(tickets, [
 *     { header: "Incident", get: t => t.incidentNumber },
 *     { header: "State",    get: t => t.state },
 *     { header: "Reported", get: t => t.reportedAt },
 *   ]);
 *
 * RFC 4180 compliant via the shared `csvEscape` helper from the
 * cutover module — exact same escaping rules so one mental model
 * covers every export in the app.
 */
export function rowsToCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c.header)).join(","));
  for (const row of rows) {
    const cells = columns.map((col) => {
      const raw = col.get(row);
      return csvEscape(formatCell(raw));
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

/**
 * Build a filename with an ISO date suffix, e.g.
 * `tickets-2026-04-20.csv`. Used by the download response.
 */
export function csvFilename(base: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${base}-${yyyy}-${mm}-${dd}.csv`;
}

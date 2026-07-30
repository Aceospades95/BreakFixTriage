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

/**
 * Shared truncation signal for the CSV exports.
 *
 * Every export caps its query (10k or 50k rows). Nothing told the
 * person who downloaded it: a year-end ticket export returned the
 * first 10,000 of 40,000+ rows and looked complete, so a reconciliation
 * built on it would be quietly and confidently wrong.
 *
 * Two signals, because the two audiences differ. The header is for
 * anything scripting the endpoint; the trailing row is for the human
 * who opens the file in Excel and scrolls to the bottom.
 */
export const CSV_TRUNCATION_HEADER = "X-Export-Truncated";

export function truncationHeaders(
  shown: number,
  total: number,
): Record<string, string> {
  if (total <= shown) return { "X-Export-Row-Count": String(shown) };
  return {
    [CSV_TRUNCATION_HEADER]: "true",
    "X-Export-Row-Count": String(shown),
    "X-Export-Total-Count": String(total),
  };
}

/**
 * Append a visible final row when rows were dropped. Returns the CSV
 * unchanged when nothing was truncated, so callers can apply it
 * unconditionally.
 */
export function withTruncationNotice(
  csv: string,
  shown: number,
  total: number,
  hint = "Narrow the filters (borough, date range, state) and export again to get the rest.",
): string {
  if (total <= shown) return csv;
  const note = `TRUNCATED: showing ${shown.toLocaleString()} of ${total.toLocaleString()} matching rows. ${hint}`;
  return `${csv}\n${csvEscape(note)}\n`;
}

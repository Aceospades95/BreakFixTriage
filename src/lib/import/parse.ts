import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  rows: Record<string, unknown>[];
  headers: string[];
}

/** Parse a CSV buffer into { rows, headers } using papaparse. */
export function parseCsv(buf: Buffer): ParsedFile {
  const text = buf.toString("utf8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.type !== "FieldMismatch");
    if (critical.length > 0) {
      throw new Error(
        `CSV parse errors: ${critical.map((e) => e.message).join("; ")}`,
      );
    }
  }
  return {
    rows: result.data,
    headers: result.meta.fields ?? [],
  };
}

/** Parse an XLSX buffer into { rows, headers } using SheetJS. */
export function parseXlsx(buf: Buffer): ParsedFile {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const firstName = wb.SheetNames[0];
  if (!firstName) throw new Error("XLSX contains no sheets");
  const sheet = wb.Sheets[firstName];
  if (!sheet) throw new Error(`XLSX sheet "${firstName}" is empty`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  return { rows, headers };
}

/** Dispatch based on filename suffix. */
export function parseFile(filename: string, buf: Buffer): ParsedFile {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buf);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseXlsx(buf);
  throw new Error(`Unsupported file type: ${filename}`);
}

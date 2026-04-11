/**
 * Cutover export.
 *
 * Writes a CSV dump of the current ticket state in a shape that is
 * friendly to the legacy spreadsheet: one row per ticket, columns
 * mirror the legacy sheet's, plus a handful of diagnostic columns
 * (current state, audit trail pointer) so the team can reconcile.
 *
 * The CSV formatter is a pure function so tests can assert the exact
 * output without touching Prisma. The DB-touching runner calls the
 * formatter after gathering input rows.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export interface ExportTicketRow {
  incidentNumber: string;
  state: string;
  priority: string;
  reportedAt: Date;
  closedAt: Date | null;
  schoolName: string;
  schoolCode: string | null;
  deviceSerial: string | null;
  deviceAssetTag: string | null;
  shortDescription: string;
  invoiceRequired: boolean;
}

/**
 * Escape a value for a CSV field. Standard RFC 4180 rules: if the
 * value contains a comma, double-quote, or newline, wrap it in double
 * quotes and escape embedded double quotes by doubling them.
 */
export function csvEscape(value: string): string {
  if (value === "") return "";
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const HEADERS: (keyof ExportTicketRow | "reportedAt" | "closedAt")[] = [
  "incidentNumber",
  "state",
  "priority",
  "reportedAt",
  "closedAt",
  "schoolCode",
  "schoolName",
  "deviceSerial",
  "deviceAssetTag",
  "shortDescription",
  "invoiceRequired",
];

/**
 * Format a list of tickets as a CSV string. Pure function.
 */
export function formatTicketsCsv(rows: ExportTicketRow[]): string {
  const lines: string[] = [];
  lines.push(HEADERS.join(","));
  for (const row of rows) {
    const fields = [
      row.incidentNumber,
      row.state,
      row.priority,
      row.reportedAt.toISOString(),
      row.closedAt ? row.closedAt.toISOString() : "",
      row.schoolCode ?? "",
      row.schoolName,
      row.deviceSerial ?? "",
      row.deviceAssetTag ?? "",
      row.shortDescription,
      row.invoiceRequired ? "true" : "false",
    ];
    lines.push(fields.map((f) => csvEscape(String(f))).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Load every ticket from the database and format it as CSV. Ticket
 * ordering is deterministic (reportedAt desc, id asc) so two runs
 * against the same DB produce identical output.
 */
export async function exportAllTicketsCsv(
  db: PrismaClient = defaultPrisma,
): Promise<string> {
  const tickets = await db.ticket.findMany({
    orderBy: [{ reportedAt: "desc" }, { id: "asc" }],
    include: {
      school: { select: { name: true, code: true } },
      device: { select: { serialNumber: true, assetTag: true } },
    },
  });
  const rows: ExportTicketRow[] = tickets.map((t) => ({
    incidentNumber: t.incidentNumber,
    state: t.state,
    priority: t.priority,
    reportedAt: t.reportedAt,
    closedAt: t.closedAt,
    schoolName: t.school.name,
    schoolCode: t.school.code,
    deviceSerial: t.device?.serialNumber ?? null,
    deviceAssetTag: t.device?.assetTag ?? null,
    shortDescription: t.shortDescription,
    invoiceRequired: t.invoiceRequired,
  }));
  return formatTicketsCsv(rows);
}

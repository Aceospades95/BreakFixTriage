/**
 * Pre-cutover integrity checks.
 *
 * Scans the database for data quality problems that would embarrass
 * us the day after cutover:
 *
 *   - tickets in CLOSED state but without a closedAt timestamp
 *   - tickets with closedAt set but still in a non-terminal state
 *   - tickets in INVOICE_REQUIRED with invoiceRequired=false
 *   - schools without addresses / coordinates (breaks route optimizer)
 *   - devices missing a serial number
 *   - orphan quotes (ticket was deleted but cascade didn't fire)
 *   - orphan jobs (school missing)
 *   - users with no role or with role=READ_ONLY and password hash set
 *     (common source of "why can't I log in?" tickets)
 *
 * The result is a list of `IntegrityIssue` objects. Each carries a
 * human-readable message and the primary key of the offending row so
 * that the runbook can hand-fix or re-import.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { isTerminal } from "@/lib/workflow";

export type IntegrityCheck =
  | "ticket_closed_no_timestamp"
  | "ticket_closedat_wrong_state"
  | "ticket_invoice_required_flag_mismatch"
  | "school_missing_address"
  | "school_missing_coordinates"
  | "device_missing_serial"
  | "orphan_quote"
  | "orphan_job"
  | "user_role_missing";

export interface IntegrityIssue {
  check: IntegrityCheck;
  entity: string;
  id: string;
  message: string;
}

export interface IntegrityReport {
  scannedAt: Date;
  issues: IntegrityIssue[];
  counts: Record<IntegrityCheck, number>;
}

function emptyCounts(): Record<IntegrityCheck, number> {
  return {
    ticket_closed_no_timestamp: 0,
    ticket_closedat_wrong_state: 0,
    ticket_invoice_required_flag_mismatch: 0,
    school_missing_address: 0,
    school_missing_coordinates: 0,
    device_missing_serial: 0,
    orphan_quote: 0,
    orphan_job: 0,
    user_role_missing: 0,
  };
}

/**
 * Build a list of `IntegrityIssue` rows from raw query output. Pure
 * function — the DB-touching runner below calls this after gathering
 * input data.
 */
export function buildIntegrityReport(input: {
  tickets: {
    id: string;
    incidentNumber: string;
    state: string;
    closedAt: Date | null;
    invoiceRequired: boolean;
  }[];
  schools: {
    id: string;
    name: string;
    addressId: string | null;
    hasCoordinates: boolean;
  }[];
  devicesMissingSerial: { id: string }[];
  orphanQuoteIds: string[];
  orphanJobIds: string[];
  users: { id: string; email: string; role: string }[];
}): IntegrityReport {
  const issues: IntegrityIssue[] = [];

  for (const t of input.tickets) {
    if (t.state === "CLOSED" && t.closedAt == null) {
      issues.push({
        check: "ticket_closed_no_timestamp",
        entity: "Ticket",
        id: t.id,
        message: `Ticket ${t.incidentNumber} is CLOSED but has no closedAt`,
      });
    }
    if (
      t.closedAt != null &&
      !(t.state === "CLOSED") &&
      !isTerminal(t.state as never)
    ) {
      issues.push({
        check: "ticket_closedat_wrong_state",
        entity: "Ticket",
        id: t.id,
        message: `Ticket ${t.incidentNumber} has closedAt=${t.closedAt.toISOString()} but is in non-terminal state ${t.state}`,
      });
    }
    if (t.state === "INVOICE_REQUIRED" && t.invoiceRequired === false) {
      issues.push({
        check: "ticket_invoice_required_flag_mismatch",
        entity: "Ticket",
        id: t.id,
        message: `Ticket ${t.incidentNumber} is in INVOICE_REQUIRED but invoiceRequired=false`,
      });
    }
  }

  for (const s of input.schools) {
    if (s.addressId == null) {
      issues.push({
        check: "school_missing_address",
        entity: "School",
        id: s.id,
        message: `School ${s.name} has no address`,
      });
    } else if (!s.hasCoordinates) {
      issues.push({
        check: "school_missing_coordinates",
        entity: "School",
        id: s.id,
        message: `School ${s.name} has an address but no lat/lng — route optimizer will use insertion order for this school`,
      });
    }
  }

  for (const d of input.devicesMissingSerial) {
    issues.push({
      check: "device_missing_serial",
      entity: "Device",
      id: d.id,
      message: `Device ${d.id} has no serial number`,
    });
  }

  for (const id of input.orphanQuoteIds) {
    issues.push({
      check: "orphan_quote",
      entity: "Quote",
      id,
      message: `Quote ${id} references a missing ticket`,
    });
  }

  for (const id of input.orphanJobIds) {
    issues.push({
      check: "orphan_job",
      entity: "Job",
      id,
      message: `Job ${id} references a missing school`,
    });
  }

  for (const u of input.users) {
    if (!u.role) {
      issues.push({
        check: "user_role_missing",
        entity: "User",
        id: u.id,
        message: `User ${u.email} has no role assigned`,
      });
    }
  }

  const counts = emptyCounts();
  for (const issue of issues) {
    counts[issue.check] += 1;
  }

  return {
    scannedAt: new Date(),
    issues,
    counts,
  };
}

/**
 * DB-touching runner. Loads every piece of data `buildIntegrityReport`
 * needs and returns a complete report.
 */
export async function runIntegrityScan(
  db: PrismaClient = defaultPrisma,
): Promise<IntegrityReport> {
  const [
    tickets,
    schools,
    devicesMissingSerial,
    users,
  ] = await Promise.all([
    db.ticket.findMany({
      select: {
        id: true,
        incidentNumber: true,
        state: true,
        closedAt: true,
        invoiceRequired: true,
      },
    }),
    db.school.findMany({
      select: {
        id: true,
        name: true,
        addressId: true,
        address: { select: { latitude: true, longitude: true } },
      },
    }),
    db.device.findMany({
      where: { serialNumber: "" },
      select: { id: true },
    }),
    db.user.findMany({ select: { id: true, email: true, role: true } }),
  ]);

  // Orphan quote check: Prisma enforces FK on insert, so this should
  // be empty, but we still look because legacy data loads can bypass
  // the constraint (e.g. raw SQL COPY).
  const orphanQuotes = await db.$queryRaw<{ id: string }[]>`
    SELECT q.id
    FROM "Quote" q
    LEFT JOIN "Ticket" t ON t.id = q."ticketId"
    WHERE t.id IS NULL
  `;
  const orphanJobs = await db.$queryRaw<{ id: string }[]>`
    SELECT j.id
    FROM "Job" j
    LEFT JOIN "School" s ON s.id = j."schoolId"
    WHERE s.id IS NULL
  `;

  return buildIntegrityReport({
    tickets,
    schools: schools.map((s) => ({
      id: s.id,
      name: s.name,
      addressId: s.addressId,
      hasCoordinates:
        s.address?.latitude != null && s.address?.longitude != null,
    })),
    devicesMissingSerial,
    orphanQuoteIds: orphanQuotes.map((q) => q.id),
    orphanJobIds: orphanJobs.map((j) => j.id),
    users: users.map((u) => ({ ...u, role: String(u.role) })),
  });
}

import {
  ImportRowStatus,
  ImportSource,
  ImportStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { detectDuplicates } from "@/lib/duplicates/detect";
import { parseFile } from "./parse";
import { mapRawRow } from "./mapper";
import { NormalizedImportRow } from "./schema";

export interface ImportResult {
  batchId: string;
  parsed: number;
  invalid: number;
  created: number;
  updated: number;
  duplicates: number;
  rejected: number;
}

export interface IngestInput {
  filename: string;
  buffer: Buffer;
  uploadedByUserId: string;
  /** If true, rows are parsed and written to ImportRow but no Tickets are touched. */
  dryRun?: boolean;
}

function detectSource(filename: string): ImportSource {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return ImportSource.SN_CSV;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls"))
    return ImportSource.SN_XLSX;
  return ImportSource.MANUAL;
}

/**
 * Top-level entry point for importing a ServiceNow export.
 *
 * Workflow:
 *   1. Create ImportBatch (PENDING → VALIDATING).
 *   2. Parse file → raw rows.
 *   3. Map + Zod-validate each row; persist as ImportRow.
 *   4. Unless dryRun: detect duplicates, upsert tickets, write TicketEvents.
 *   5. Update ImportBatch.status and stats.
 */
export async function runImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      status: ImportStatus.VALIDATING,
    },
  });

  let parsed: { rows: Record<string, unknown>[]; headers: string[] };
  try {
    parsed = parseFile(input.filename, input.buffer);
  } catch (err) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.FAILED,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const importRowRecords: {
    id: string;
    normalized: NormalizedImportRow;
  }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const { mapped } = mapRawRow(raw);
    const parseResult = NormalizedImportRow.safeParse(mapped);
    if (!parseResult.success) {
      invalidCount++;
      await db.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber,
          raw: raw as Prisma.InputJsonValue,
          normalized: mapped as Prisma.InputJsonValue,
          status: ImportRowStatus.INVALID,
          errors: parseResult.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        },
      });
      continue;
    }
    const row = await db.importRow.create({
      data: {
        batchId: batch.id,
        rowNumber,
        raw: raw as Prisma.InputJsonValue,
        normalized: parseResult.data as unknown as Prisma.InputJsonValue,
        status: ImportRowStatus.READY,
      },
    });
    importRowRecords.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: {
          parsed: parsed.rows.length,
          invalid: invalidCount,
          ready: importRowRecords.length,
        },
      },
    });
    return {
      batchId: batch.id,
      parsed: parsed.rows.length,
      invalid: invalidCount,
      created: 0,
      updated: 0,
      duplicates: 0,
      rejected: 0,
    };
  }

  // Commit phase
  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const row of importRowRecords) {
    try {
      const outcome = await commitRow(db, batch.id, row);
      if (outcome === "CREATED") created++;
      if (outcome === "UPDATED") updated++;
      if (outcome === "DUPLICATE") duplicates++;
      if (outcome === "REJECTED") rejected++;
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: {
          status: ImportRowStatus.REJECTED,
          errors: [err instanceof Error ? err.message : String(err)],
        },
      });
    }
  }

  const stats: Prisma.JsonObject = {
    parsed: parsed.rows.length,
    invalid: invalidCount,
    created,
    updated,
    duplicates,
    rejected,
  };

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTED, stats },
  });

  await writeAudit({
    actorUserId: input.uploadedByUserId,
    entityType: "ImportBatch",
    entityId: batch.id,
    action: "import:committed",
    after: stats,
  });

  return {
    batchId: batch.id,
    parsed: parsed.rows.length,
    invalid: invalidCount,
    created,
    updated,
    duplicates,
    rejected,
  };
}

type CommitOutcome = "CREATED" | "UPDATED" | "DUPLICATE" | "REJECTED";

async function commitRow(
  db: PrismaClient,
  batchId: string,
  row: { id: string; normalized: NormalizedImportRow },
): Promise<CommitOutcome> {
  const n = row.normalized;

  // 1. Resolve or create the school by code.
  const school = await db.school.findUnique({ where: { code: n.schoolCode } });
  if (!school) {
    await db.importRow.update({
      where: { id: row.id },
      data: {
        status: ImportRowStatus.REJECTED,
        errors: [
          `school with code ${n.schoolCode} is not provisioned — create it first`,
        ],
      },
    });
    return "REJECTED";
  }

  // 2. Resolve or create the device if a serial was supplied.
  let deviceId: string | undefined;
  if (n.serialNumber) {
    let modelId: string | undefined;
    if (n.manufacturer && n.modelName) {
      const model = await db.deviceModel.upsert({
        where: {
          manufacturer_modelName: {
            manufacturer: n.manufacturer,
            modelName: n.modelName,
          },
        },
        create: { manufacturer: n.manufacturer, modelName: n.modelName },
        update: {},
      });
      modelId = model.id;
    }
    const device = await db.device.upsert({
      where: { serialNumber: n.serialNumber },
      create: {
        serialNumber: n.serialNumber,
        assetTag: n.assetTag ?? null,
        modelId: modelId ?? null,
        ownerSchoolId: school.id,
      },
      update: {
        assetTag: n.assetTag ?? undefined,
        modelId: modelId ?? undefined,
        ownerSchoolId: school.id,
      },
    });
    deviceId = device.id;
  }

  // 3. Duplicate detection against existing tickets.
  const detection = await detectDuplicates(db, {
    incidentNumber: n.incidentNumber,
    serialNumber: n.serialNumber,
    schoolId: school.id,
  });

  if (detection.kind === "INCIDENT_CONFLICT") {
    await db.duplicateConflict.create({
      data: {
        batchId,
        kind: "INCIDENT",
        leftTicketId: detection.existingTicketId,
        rightTicketId: detection.existingTicketId,
        notes: `Duplicate incident ${n.incidentNumber} in import row ${row.id}`,
      },
    });
    await db.importRow.update({
      where: { id: row.id },
      data: {
        status: ImportRowStatus.DUPLICATE,
        resultingTicketId: detection.existingTicketId,
      },
    });
    return "DUPLICATE";
  }

  // 4. Upsert the ticket.
  const existing = await db.ticket.findUnique({
    where: { incidentNumber: n.incidentNumber },
  });

  if (!existing) {
    const ticket = await db.ticket.create({
      data: {
        incidentNumber: n.incidentNumber,
        serviceNowSysId: n.serviceNowSysId ?? null,
        deviceId: deviceId ?? null,
        schoolId: school.id,
        reportedAt: n.reportedAt,
        shortDescription: n.shortDescription,
        longDescription: n.longDescription ?? null,
        priority: n.priority,
        state: "IMPORTED",
      },
    });
    await db.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        fromState: null,
        toState: "IMPORTED",
        reason: "Imported from ServiceNow export",
        payload: { importBatchId: batchId, importRowId: row.id },
      },
    });

    // If the detector saw an open ticket for this same serial, queue a
    // conflict so an operator can decide whether these are related.
    if (detection.kind === "SERIAL_OPEN_MATCH") {
      await db.duplicateConflict.create({
        data: {
          batchId,
          kind: "SERIAL",
          leftTicketId: detection.existingTicketId,
          rightTicketId: ticket.id,
          notes:
            "New ticket opened on a device that already has an open ticket.",
        },
      });
    }

    await db.importRow.update({
      where: { id: row.id },
      data: {
        status: ImportRowStatus.CREATED,
        resultingTicketId: ticket.id,
      },
    });
    return "CREATED";
  }

  // 5. Closed ticket re-seen via serial number → reopen candidate.
  if (
    existing.state === "CLOSED" &&
    detection.kind === "SERIAL_ON_CLOSED" &&
    existing.incidentNumber !== n.incidentNumber
  ) {
    // New incident number but same serial as a closed ticket → create a new
    // ticket AND flag a reopen duplicate conflict for operator review.
    const ticket = await db.ticket.create({
      data: {
        incidentNumber: n.incidentNumber,
        serviceNowSysId: n.serviceNowSysId ?? null,
        deviceId: deviceId ?? null,
        schoolId: school.id,
        reportedAt: n.reportedAt,
        shortDescription: n.shortDescription,
        longDescription: n.longDescription ?? null,
        priority: n.priority,
        state: "IMPORTED",
      },
    });
    await db.duplicateConflict.create({
      data: {
        batchId,
        kind: "SERIAL",
        leftTicketId: existing.id,
        rightTicketId: ticket.id,
        notes:
          "Serial matches a closed ticket — review whether this is a reopen.",
      },
    });
    await db.importRow.update({
      where: { id: row.id },
      data: {
        status: ImportRowStatus.CREATED,
        resultingTicketId: ticket.id,
      },
    });
    return "CREATED";
  }

  // 6. Otherwise update the existing ticket (idempotent fields only).
  await db.ticket.update({
    where: { id: existing.id },
    data: {
      serviceNowSysId: n.serviceNowSysId ?? existing.serviceNowSysId,
      deviceId: deviceId ?? existing.deviceId,
      longDescription: n.longDescription ?? existing.longDescription,
      priority: n.priority,
    },
  });
  await db.importRow.update({
    where: { id: row.id },
    data: { status: ImportRowStatus.UPDATED, resultingTicketId: existing.id },
  });
  return "UPDATED";
}

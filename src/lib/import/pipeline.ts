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
import { mapRawRow, mapRawSchoolRow, mapRawDeviceRow, mapRawUserRow, mapRawPartRow, mapRawDeviceModelRow } from "./mapper";
import { NormalizedImportRow, NormalizedSchoolRow, NormalizedDeviceRow, NormalizedUserRow, NormalizedPartRow, NormalizedDeviceModelRow } from "./schema";
import { translateImportError, type TranslateContext } from "./error-translate";

/**
 * Build the row-level context that `translateImportError` uses to
 * splice human-readable values into operator-facing messages.
 * Generic over every NormalizedImportRow / Schools / Devices / etc.
 * shape — only the fields that exist on the given row land in the
 * context.
 */
function importRowContext(row: {
  rowNumber?: number;
  normalized?: Record<string, unknown> | null;
}): TranslateContext {
  const n = row.normalized ?? {};
  const get = (key: string): string | null => {
    const v = (n as Record<string, unknown>)[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    rowNumber: row.rowNumber,
    assetTag: get("assetTag"),
    serialNumber: get("serialNumber"),
    schoolCode: get("schoolCode") ?? get("code"),
    incidentNumber: get("incidentNumber"),
    email: get("email") ?? get("requesterEmail"),
  };
}

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
        error: translateImportError(err),
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
      const ctx = importRowContext(row);
      await db.importRow.update({
        where: { id: row.id },
        data: {
          status: ImportRowStatus.REJECTED,
          errors: [translateImportError(err, ctx)],
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

export type CommitOutcome = "CREATED" | "UPDATED" | "DUPLICATE" | "REJECTED";

export async function commitRow(
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

// ---------------------------------------------------------------------------
// School import pipeline
// ---------------------------------------------------------------------------

export async function runSchoolImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      // type field added in schema but not yet in generated client
      ...({ type: "SCHOOLS" } as Record<string, unknown>),
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
        error: translateImportError(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const validRows: { id: string; normalized: NormalizedSchoolRow }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2;
    const { mapped } = mapRawSchoolRow(raw);
    const parseResult = NormalizedSchoolRow.safeParse(mapped);
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
    validRows.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: { parsed: parsed.rows.length, invalid: invalidCount, ready: validRows.length },
      },
    });
    return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created: 0, updated: 0, duplicates: 0, rejected: 0 };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const row of validRows) {
    try {
      const n = row.normalized;
      // Find or create district
      let district = await db.district.findFirst({ where: { name: { equals: n.districtName, mode: "insensitive" } } });
      if (!district) {
        // Generate a code from the district name (lowercase, no spaces)
        const districtCode = n.districtName.replace(/\s+/g, "-").toLowerCase().slice(0, 20);
        district = await db.district.create({ data: { name: n.districtName, code: districtCode } });
      }
      // Upsert school by code
      const existing = await db.school.findFirst({ where: { code: { equals: n.code, mode: "insensitive" } } });
      if (existing) {
        await db.school.update({
          where: { id: existing.id },
          data: { name: n.name, districtId: district.id },
        });
        updated++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.UPDATED } });
      } else {
        await db.school.create({
          data: {
            name: n.name,
            code: n.code,
            districtId: district.id,
          },
        });
        created++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.CREATED } });
      }
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: { status: ImportRowStatus.REJECTED, errors: [translateImportError(err, importRowContext(row))] },
      });
    }
  }

  const stats: Prisma.JsonObject = { parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
  await db.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, stats } });
  await writeAudit({ actorUserId: input.uploadedByUserId, entityType: "ImportBatch", entityId: batch.id, action: "import:schools:committed", after: stats });

  return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
}

// ---------------------------------------------------------------------------
// Device import pipeline
// ---------------------------------------------------------------------------

export async function runDeviceImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      // type field added in schema but not yet in generated client
      ...({ type: "DEVICES" } as Record<string, unknown>),
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
        error: translateImportError(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const validRows: { id: string; normalized: NormalizedDeviceRow }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2;
    const { mapped } = mapRawDeviceRow(raw);
    const parseResult = NormalizedDeviceRow.safeParse(mapped);
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
    validRows.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: { parsed: parsed.rows.length, invalid: invalidCount, ready: validRows.length },
      },
    });
    return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created: 0, updated: 0, duplicates: 0, rejected: 0 };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const row of validRows) {
    try {
      const n = row.normalized;
      // Resolve school
      const school = await db.school.findFirst({ where: { code: { equals: n.schoolCode, mode: "insensitive" } } });
      if (!school) {
        rejected++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.REJECTED, errors: [`School not found: ${n.schoolCode}`] } });
        continue;
      }
      // Resolve or create DeviceModel
      let deviceModelId: string | undefined;
      if (n.manufacturer && n.modelName) {
        const dm = await db.deviceModel.upsert({
          where: { manufacturer_modelName: { manufacturer: n.manufacturer, modelName: n.modelName } },
          create: { manufacturer: n.manufacturer, modelName: n.modelName },
          update: {},
        });
        deviceModelId = dm.id;
      }
      // Upsert device by serial number
      const existing = await db.device.findFirst({ where: { serialNumber: { equals: n.serialNumber, mode: "insensitive" } } });
      if (existing) {
        await db.device.update({
          where: { id: existing.id },
          data: {
            ownerSchoolId: school.id,
            ...(n.assetTag ? { assetTag: n.assetTag } : {}),
            ...(deviceModelId ? { modelId: deviceModelId } : {}),
          },
        });
        updated++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.UPDATED } });
      } else {
        await db.device.create({
          data: {
            serialNumber: n.serialNumber,
            ownerSchoolId: school.id,
            ...(n.assetTag ? { assetTag: n.assetTag } : {}),
            ...(deviceModelId ? { modelId: deviceModelId } : {}),
          },
        });
        created++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.CREATED } });
      }
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: { status: ImportRowStatus.REJECTED, errors: [translateImportError(err, importRowContext(row))] },
      });
    }
  }

  const stats: Prisma.JsonObject = { parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
  await db.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, stats } });
  await writeAudit({ actorUserId: input.uploadedByUserId, entityType: "ImportBatch", entityId: batch.id, action: "import:devices:committed", after: stats });

  return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
}

// ---------------------------------------------------------------------------
// User import pipeline
// ---------------------------------------------------------------------------

export async function runUserImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      ...({ type: "USERS" } as Record<string, unknown>),
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
        error: translateImportError(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const validRows: { id: string; normalized: NormalizedUserRow }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2;
    const { mapped } = mapRawUserRow(raw);
    const parseResult = NormalizedUserRow.safeParse(mapped);
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
    validRows.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: { parsed: parsed.rows.length, invalid: invalidCount, ready: validRows.length },
      },
    });
    return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created: 0, updated: 0, duplicates: 0, rejected: 0 };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const row of validRows) {
    try {
      const n = row.normalized;
      const existing = await db.user.findFirst({ where: { email: { equals: n.email, mode: "insensitive" } } });
      if (existing) {
        await db.user.update({
          where: { id: existing.id },
          data: {
            name: n.name,
            role: n.role as never,
          },
        });
        updated++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.UPDATED } });
      } else {
        // Hash password if provided, otherwise use a random placeholder
        const bcrypt = await import("bcryptjs");
        const passwordHash = await bcrypt.hash(n.password && n.password.length > 0 ? n.password : crypto.randomUUID(), 10);
        await db.user.create({
          data: {
            name: n.name,
            email: n.email.toLowerCase(),
            passwordHash,
            role: n.role as never,
          },
        });
        created++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.CREATED } });
      }
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: { status: ImportRowStatus.REJECTED, errors: [translateImportError(err, importRowContext(row))] },
      });
    }
  }

  const stats: Prisma.JsonObject = { parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
  await db.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, stats } });
  await writeAudit({ actorUserId: input.uploadedByUserId, entityType: "ImportBatch", entityId: batch.id, action: "import:users:committed", after: stats });

  return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
}

// ---------------------------------------------------------------------------
// Part import pipeline
// ---------------------------------------------------------------------------

export async function runPartImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      ...({ type: "PARTS" } as Record<string, unknown>),
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
        error: translateImportError(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const validRows: { id: string; normalized: NormalizedPartRow }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2;
    const { mapped } = mapRawPartRow(raw);
    const parseResult = NormalizedPartRow.safeParse(mapped);
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
    validRows.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: { parsed: parsed.rows.length, invalid: invalidCount, ready: validRows.length },
      },
    });
    return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created: 0, updated: 0, duplicates: 0, rejected: 0 };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const row of validRows) {
    try {
      const n = row.normalized;
      // Resolve DeviceModel if manufacturer+model provided
      let deviceModelId: string | undefined;
      if (n.manufacturer && n.modelName) {
        const dm = await db.deviceModel.upsert({
          where: { manufacturer_modelName: { manufacturer: n.manufacturer, modelName: n.modelName } },
          create: { manufacturer: n.manufacturer, modelName: n.modelName },
          update: {},
        });
        deviceModelId = dm.id;
      }
      // Upsert part by SKU
      const existing = await db.part.findFirst({ where: { sku: { equals: n.sku, mode: "insensitive" } } });
      if (existing) {
        await db.part.update({
          where: { id: existing.id },
          data: {
            name: n.name,
            ...(n.costCents !== undefined ? { costCents: n.costCents } : {}),
            ...(n.stockQty !== undefined ? { onHand: n.stockQty } : {}),
            ...(n.minStockQty !== undefined ? { reorderLevel: n.minStockQty } : {}),
            ...(deviceModelId ? { compatibleModels: { connect: { id: deviceModelId } } } : {}),
          },
        });
        updated++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.UPDATED } });
      } else {
        await db.part.create({
          data: {
            sku: n.sku,
            name: n.name,
            costCents: n.costCents ?? 0,
            onHand: n.stockQty ?? 0,
            reorderLevel: n.minStockQty ?? 0,
            ...(deviceModelId ? { compatibleModels: { connect: { id: deviceModelId } } } : {}),
          },
        });
        created++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.CREATED } });
      }
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: { status: ImportRowStatus.REJECTED, errors: [translateImportError(err, importRowContext(row))] },
      });
    }
  }

  const stats: Prisma.JsonObject = { parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
  await db.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, stats } });
  await writeAudit({ actorUserId: input.uploadedByUserId, entityType: "ImportBatch", entityId: batch.id, action: "import:parts:committed", after: stats });

  return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
}

// ---------------------------------------------------------------------------
// Device model import pipeline
// ---------------------------------------------------------------------------

export async function runDeviceModelImport(
  input: IngestInput,
  db: PrismaClient = defaultPrisma,
): Promise<ImportResult> {
  const source = detectSource(input.filename);
  const batch = await db.importBatch.create({
    data: {
      filename: input.filename,
      uploadedByUserId: input.uploadedByUserId,
      source,
      ...({ type: "DEVICE_MODELS" } as Record<string, unknown>),
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
        error: translateImportError(err),
      },
    });
    throw err;
  }

  let invalidCount = 0;
  const validRows: { id: string; normalized: NormalizedDeviceModelRow }[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i] ?? {};
    const rowNumber = i + 2;
    const { mapped } = mapRawDeviceModelRow(raw);
    const parseResult = NormalizedDeviceModelRow.safeParse(mapped);
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
    validRows.push({ id: row.id, normalized: parseResult.data });
  }

  if (input.dryRun) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.READY,
        stats: { parsed: parsed.rows.length, invalid: invalidCount, ready: validRows.length },
      },
    });
    return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created: 0, updated: 0, duplicates: 0, rejected: 0 };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTING },
  });

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const row of validRows) {
    try {
      const n = row.normalized;
      // Upsert by manufacturer + model name compound unique
      const existing = await db.deviceModel.findUnique({
        where: { manufacturer_modelName: { manufacturer: n.manufacturer, modelName: n.modelName } },
      });
      if (existing) {
        await db.deviceModel.update({
          where: { id: existing.id },
          data: {
            formFactor: n.formFactor as never,
            ...(n.warrantyMonths !== undefined ? { warrantyMonths: n.warrantyMonths } : {}),
            ...(n.repairNotes ? { repairNotes: n.repairNotes } : {}),
          },
        });
        updated++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.UPDATED } });
      } else {
        await db.deviceModel.create({
          data: {
            manufacturer: n.manufacturer,
            modelName: n.modelName,
            formFactor: n.formFactor as never,
            ...(n.warrantyMonths !== undefined ? { warrantyMonths: n.warrantyMonths } : {}),
            ...(n.repairNotes ? { repairNotes: n.repairNotes } : {}),
          },
        });
        created++;
        await db.importRow.update({ where: { id: row.id }, data: { status: ImportRowStatus.CREATED } });
      }
    } catch (err) {
      rejected++;
      await db.importRow.update({
        where: { id: row.id },
        data: { status: ImportRowStatus.REJECTED, errors: [translateImportError(err, importRowContext(row))] },
      });
    }
  }

  const stats: Prisma.JsonObject = { parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
  await db.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, stats } });
  await writeAudit({ actorUserId: input.uploadedByUserId, entityType: "ImportBatch", entityId: batch.id, action: "import:device_models:committed", after: stats });

  return { batchId: batch.id, parsed: parsed.rows.length, invalid: invalidCount, created, updated, duplicates: 0, rejected };
}

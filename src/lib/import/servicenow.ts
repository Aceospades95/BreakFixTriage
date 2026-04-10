/**
 * ServiceNow API connector.
 *
 * This module is split into three layers so the pure parts can be
 * unit-tested without touching the network:
 *
 *   1. `normalizeServiceNowRow(rawRecord)` — pure mapper from the JSON
 *      shape returned by the ServiceNow Table API to the existing
 *      `NormalizedImportRow` shape used by the rest of the importer.
 *
 *   2. `fetchServiceNowIncidents(config)` — thin `fetch` wrapper around
 *      `/api/now/table/incident` with basic auth, paging, and the
 *      standard filter for active tickets.
 *
 *   3. `runServiceNowSync(input)` — top-level entry point that creates
 *      an ImportBatch, normalizes each record, writes ImportRow rows,
 *      and commits them through the existing `commitRow` helper.
 *
 * Config is read from env vars at the edge (`runServiceNowSync`) so
 * the lower layers stay unit-testable.
 */

import {
  ImportRowStatus,
  ImportSource,
  ImportStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { NormalizedImportRow } from "./schema";
import { commitRow, type ImportResult } from "./pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceNowConfig {
  baseUrl: string;
  username: string;
  password: string;
  /** Optional sysparm_query override; default syncs non-closed incidents. */
  query?: string;
  /** Page size (default 200). */
  limit?: number;
}

/**
 * Subset of ServiceNow incident fields we actually care about. The
 * real response has dozens more — we ignore them.
 */
export interface ServiceNowIncidentRecord {
  number?: string;
  sys_id?: string;
  short_description?: string;
  description?: string;
  opened_at?: string;
  priority?: string;
  u_school_code?: string;
  location?: string | { display_value?: string };
  cmdb_ci?: string | { display_value?: string };
  u_serial_number?: string;
  u_asset_tag?: string;
  u_manufacturer?: string;
  u_model?: string;
  requested_for?: string | { display_value?: string };
  u_requester_email?: string;
  state?: string;
  // Allow unknown fields through.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Pure normalizer
// ---------------------------------------------------------------------------

function unwrap(
  field: unknown,
): string | undefined {
  if (field == null) return undefined;
  if (typeof field === "string") return field.trim() || undefined;
  if (typeof field === "object" && "display_value" in field) {
    const dv = (field as { display_value?: unknown }).display_value;
    if (typeof dv === "string") return dv.trim() || undefined;
  }
  return undefined;
}

/**
 * Turn a raw ServiceNow incident record into the canonical
 * NormalizedImportRow shape. Returns null if the record is missing
 * fields that are required by our schema (incident number, short
 * description, opened_at, or u_school_code). Those records are
 * deliberately dropped rather than rejected so a partially-populated
 * ServiceNow instance doesn't block the sync.
 */
export function normalizeServiceNowRow(
  record: ServiceNowIncidentRecord,
): Record<string, unknown> | null {
  const incidentNumber = unwrap(record.number);
  const shortDescription = unwrap(record.short_description);
  const openedAt = unwrap(record.opened_at);
  const schoolCode = unwrap(record.u_school_code);

  if (!incidentNumber || !shortDescription || !openedAt || !schoolCode) {
    return null;
  }

  const priority = mapServiceNowPriority(unwrap(record.priority));

  return {
    incidentNumber,
    serviceNowSysId: unwrap(record.sys_id),
    reportedAt: openedAt,
    shortDescription,
    longDescription: unwrap(record.description),
    priority,
    schoolCode,
    schoolName: unwrap(record.location),
    serialNumber: unwrap(record.u_serial_number) ?? unwrap(record.cmdb_ci),
    assetTag: unwrap(record.u_asset_tag),
    manufacturer: unwrap(record.u_manufacturer),
    modelName: unwrap(record.u_model),
    requesterName: unwrap(record.requested_for),
    requesterEmail: unwrap(record.u_requester_email),
  };
}

function mapServiceNowPriority(
  raw: string | undefined,
): "LOW" | "NORMAL" | "HIGH" | "URGENT" {
  if (!raw) return "NORMAL";
  const trimmed = raw.trim();
  // ServiceNow uses numeric codes 1–5 and sometimes labels.
  if (/^1(\s|$)/.test(trimmed)) return "URGENT";
  if (/^2(\s|$)/.test(trimmed)) return "HIGH";
  if (/^3(\s|$)/.test(trimmed)) return "NORMAL";
  if (/^4(\s|$)/.test(trimmed)) return "LOW";
  if (/^5(\s|$)/.test(trimmed)) return "LOW";
  const lower = trimmed.toLowerCase();
  if (lower.includes("critical") || lower.includes("urgent")) return "URGENT";
  if (lower.includes("high")) return "HIGH";
  if (lower.includes("low")) return "LOW";
  return "NORMAL";
}

// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------

/**
 * Default filter: active tickets only, ordered by opened_at desc. The
 * exact field names come from the out-of-the-box ServiceNow incident
 * table; override via `query` if the target instance has been
 * customized.
 */
const DEFAULT_QUERY = "active=true^ORDERBYDESCopened_at";

export async function fetchServiceNowIncidents(
  config: ServiceNowConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceNowIncidentRecord[]> {
  const limit = config.limit ?? 200;
  const query = encodeURIComponent(config.query ?? DEFAULT_QUERY);
  const base = config.baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/now/table/incident?sysparm_limit=${limit}&sysparm_query=${query}`;

  const auth = Buffer.from(
    `${config.username}:${config.password}`,
  ).toString("base64");

  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `ServiceNow HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const body = (await res.json()) as {
    result?: ServiceNowIncidentRecord[];
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(`ServiceNow error: ${body.error.message ?? "unknown"}`);
  }
  return body.result ?? [];
}

// ---------------------------------------------------------------------------
// Top-level sync runner
// ---------------------------------------------------------------------------

export interface RunServiceNowSyncInput {
  config: ServiceNowConfig;
  triggeredByUserId: string;
}

/**
 * Pull the current ServiceNow queue, normalize each record, and run
 * the existing commit pipeline against it. Creates an ImportBatch so
 * the sync shows up in /imports alongside manual uploads.
 */
export async function runServiceNowSync(
  input: RunServiceNowSyncInput,
  db: PrismaClient = defaultPrisma,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult> {
  const batch = await db.importBatch.create({
    data: {
      filename: `servicenow-sync-${new Date().toISOString()}`,
      uploadedByUserId: input.triggeredByUserId,
      source: ImportSource.MANUAL, // closest enum value
      status: ImportStatus.VALIDATING,
    },
  });

  let records: ServiceNowIncidentRecord[];
  try {
    records = await fetchServiceNowIncidents(input.config, fetchImpl);
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

  for (let i = 0; i < records.length; i++) {
    const raw = records[i] ?? {};
    const rowNumber = i + 1;
    const mapped = normalizeServiceNowRow(raw);
    if (!mapped) {
      invalidCount++;
      await db.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber,
          raw: raw as unknown as Prisma.InputJsonValue,
          status: ImportRowStatus.INVALID,
          errors: ["missing required ServiceNow fields (number, short_description, opened_at, u_school_code)"],
        },
      });
      continue;
    }
    const parseResult = NormalizedImportRow.safeParse(mapped);
    if (!parseResult.success) {
      invalidCount++;
      await db.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber,
          raw: raw as unknown as Prisma.InputJsonValue,
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
        raw: raw as unknown as Prisma.InputJsonValue,
        normalized: parseResult.data as unknown as Prisma.InputJsonValue,
        status: ImportRowStatus.READY,
      },
    });
    importRowRecords.push({ id: row.id, normalized: parseResult.data });
  }

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
    parsed: records.length,
    invalid: invalidCount,
    created,
    updated,
    duplicates,
    rejected,
    source: "servicenow-api",
  };

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.COMMITTED, stats },
  });

  await writeAudit({
    actorUserId: input.triggeredByUserId,
    entityType: "ImportBatch",
    entityId: batch.id,
    action: "servicenow-sync:committed",
    after: stats,
  });

  return {
    batchId: batch.id,
    parsed: records.length,
    invalid: invalidCount,
    created,
    updated,
    duplicates,
    rejected,
  };
}

// ---------------------------------------------------------------------------
// Env-based config loader
// ---------------------------------------------------------------------------

export function loadServiceNowConfigFromEnv(): ServiceNowConfig | null {
  const baseUrl = process.env.SERVICENOW_BASE_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;
  if (!baseUrl || !username || !password) return null;
  return {
    baseUrl,
    username,
    password,
    query: process.env.SERVICENOW_QUERY,
    limit: process.env.SERVICENOW_LIMIT
      ? Number.parseInt(process.env.SERVICENOW_LIMIT, 10)
      : undefined,
  };
}

export function isServiceNowConfigured(): boolean {
  return loadServiceNowConfigFromEnv() != null;
}

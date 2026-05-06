/**
 * Round-4 §N1 — SNOW import reconciliation.
 *
 * After an import batch lands new tickets from SNOW, scan for
 * synthetic on-route pickup tickets (state =
 * PENDING_PICKUP_UNLINKED) whose (deviceId, schoolId) matches an
 * imported ticket. For each match, write a row to the existing
 * DuplicateConflict queue at /duplicates with kind = SERIAL —
 * the operator resolves via the same UI that handles the legacy
 * "this device already has an open ticket" duplicate flow.
 *
 * The brief is explicit: **propose, don't silently merge.** This
 * module never calls the §D merge action directly. The operator
 * accepts the proposal in /duplicates and the existing duplicate-
 * resolution flow runs the §D merge code path with copy=all.
 *
 * Idempotency: if a proposal already exists for the same (synthetic,
 * imported) pair and is unresolved, this function is a no-op.
 *
 * Returns the count of proposals created so the caller can surface
 * "We found N candidate matches in /duplicates" in the import
 * summary.
 */

import {
  DuplicateKind,
  type Prisma,
  type PrismaClient,
  TicketState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

export interface ReconcileResult {
  proposalsCreated: number;
  proposalsAlreadyOpen: number;
  /** Synthetic tickets that have no SNOW counterpart yet. */
  unmatchedSynthetics: number;
}

export async function reconcileSnowImport(
  importBatchId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ReconcileResult> {
  // 1. Pull the tickets created by THIS import batch via the
  //    ImportRow.resultingTicketId column. The pipeline tags every
  //    row it commits with that link — see src/lib/import/pipeline.ts.
  const importedTickets = await db.importRow.findMany({
    where: {
      batchId: importBatchId,
      resultingTicketId: { not: null },
    },
    select: {
      resultingTicket: {
        select: {
          id: true,
          incidentNumber: true,
          deviceId: true,
          schoolId: true,
          createdAt: true,
        },
      },
    },
  });

  // 2. Pull every synthetic on-route pickup ticket that's still in
  //    PENDING_PICKUP_UNLINKED. Bounded query — these resolve fast
  //    in practice, so the size stays small.
  const synthetics = await db.ticket.findMany({
    where: {
      state: TicketState.PENDING_PICKUP_UNLINKED,
    },
    select: {
      id: true,
      incidentNumber: true,
      deviceId: true,
      schoolId: true,
    },
  });

  let proposalsCreated = 0;
  let proposalsAlreadyOpen = 0;
  let unmatchedSynthetics = 0;

  // Index synthetics by (deviceId, schoolId) for O(1) lookup.
  const synthByKey = new Map<string, (typeof synthetics)[number][]>();
  for (const s of synthetics) {
    if (!s.deviceId) continue;
    const key = `${s.deviceId}::${s.schoolId}`;
    const list = synthByKey.get(key) ?? [];
    list.push(s);
    synthByKey.set(key, list);
  }

  const matchedSyntheticIds = new Set<string>();

  for (const row of importedTickets) {
    const t = row.resultingTicket;
    if (!t || !t.deviceId) continue;
    const key = `${t.deviceId}::${t.schoolId}`;
    const matches = synthByKey.get(key);
    if (!matches || matches.length === 0) continue;
    for (const synth of matches) {
      matchedSyntheticIds.add(synth.id);
      // Already a proposal in flight?
      const existing = await db.duplicateConflict.findFirst({
        where: {
          // The brief reuses the existing DuplicateConflict surface,
          // which models a left/right ticket pair. We use:
          //   left  = synthetic (the ROUTE_PICKUP one)
          //   right = imported (the SNOW one)
          leftTicketId: synth.id,
          rightTicketId: t.id,
          resolvedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        proposalsAlreadyOpen++;
        continue;
      }
      const conflict = await db.duplicateConflict.create({
        data: {
          batchId: importBatchId,
          kind: DuplicateKind.SERIAL,
          leftTicketId: synth.id,
          rightTicketId: t.id,
          notes:
            `Synthetic on-route pickup ${synth.incidentNumber} matches imported ` +
            `${t.incidentNumber} on (device, school). Accept to merge artefacts ` +
            `(photos, signatures, time entries, audit) into the imported ticket.`,
        },
      });
      await writeAudit(
        {
          actorUserId: null, // system
          entityType: "DuplicateConflict",
          entityId: conflict.id,
          action: "snow-merge.proposed",
          after: {
            leftTicketId: synth.id,
            rightTicketId: t.id,
            importBatchId,
          },
          reason:
            `SNOW import matched on-route pickup by (device, school). ` +
            `Operator must accept in /duplicates to run merge.`,
          transitionType: "scheduled",
        },
        db,
      );
      proposalsCreated++;
    }
  }

  unmatchedSynthetics = synthetics.length - matchedSyntheticIds.size;

  return { proposalsCreated, proposalsAlreadyOpen, unmatchedSynthetics };
}

/**
 * Pure-function variant for unit tests: given a list of synthetics
 * and a list of imported tickets, returns the (synthetic, imported)
 * pairs that should become proposals. The DB-backed version above
 * uses this match logic implicitly; the pure version exists so
 * tests can exercise the matching contract without spinning a DB.
 */
export interface MatcherTicket {
  id: string;
  deviceId: string | null;
  schoolId: string;
}

export function matchSynthsToImports(
  synthetics: MatcherTicket[],
  imports: MatcherTicket[],
): Array<{ syntheticId: string; importedId: string }> {
  const out: Array<{ syntheticId: string; importedId: string }> = [];
  const synthByKey = new Map<string, string[]>();
  for (const s of synthetics) {
    if (!s.deviceId) continue;
    const key = `${s.deviceId}::${s.schoolId}`;
    const list = synthByKey.get(key) ?? [];
    list.push(s.id);
    synthByKey.set(key, list);
  }
  for (const i of imports) {
    if (!i.deviceId) continue;
    const list = synthByKey.get(`${i.deviceId}::${i.schoolId}`);
    if (!list) continue;
    for (const sid of list) {
      out.push({ syntheticId: sid, importedId: i.id });
    }
  }
  return out;
}

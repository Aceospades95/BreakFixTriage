/**
 * Round-7 §3C — SNOW import reconciliation: importer-side
 * synthetic auto-merge.
 *
 * Round-4 §N1 wrote DuplicateConflict proposals here so an operator
 * had to click "Link to SNOW" in /duplicates manually. Round-7
 * promotes the same-school case to an automatic merge: when an
 * import row lands an INC for a (deviceId, schoolId) pair that
 * already has a PENDING_PICKUP_UNLINKED synthetic, the importer
 * calls mergeTicket() in the same operation. mergeTicket carries
 * the §1A device transfer + audit trail so:
 *
 *   - The operator-readable comment lands on both sides.
 *   - StopDevice rows re-point at the surviving INC.
 *   - Audit log gets `Ticket.merge` + `Ticket.device.transferred`
 *     rows tagged with the import batch.
 *
 * G7 invariant ("never silent-merge"): every auto-merge writes the
 * same comment + audit row + outcome-bucket update as the manual
 * /duplicates path. The operator-readable trail is identical.
 *
 * Cross-school edge case: synthetic at school A, import at school
 * B with the same serial → no merge (school mismatch). A comment
 * lands on the synthetic noting the cross-school collision so an
 * operator can investigate. See docs/round-7-assumptions.md for
 * the school-match policy.
 *
 * Multiple-synthetic edge case: if SYN-X and SYN-Y both exist for
 * the same (school, device), merge into the OLDER synthetic first
 * (most likely the right one), then post a comment on the loser
 * explaining "Multiple synthetics found; merged the older into
 * the import."
 */

import {
  type Prisma,
  type PrismaClient,
  TicketState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { mergeTicket } from "@/lib/tickets/merge";

export interface ReconcileResult {
  /** Synthetic tickets merged into the importer's new INC. */
  mergedFromSynthetic: number;
  /** Cross-school collisions where we deliberately didn't merge. */
  crossSchoolCollisions: number;
  /** Synthetic tickets that have no SNOW counterpart yet. */
  unmatchedSynthetics: number;
}

export async function reconcileSnowImport(
  importBatchId: string,
  actorUserId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ReconcileResult> {
  // 1. Pull the tickets created by THIS import batch.
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
  //    PENDING_PICKUP_UNLINKED. Order ascending by createdAt so the
  //    OLDER synthetic wins in the multi-synthetic edge case.
  const synthetics = await db.ticket.findMany({
    where: {
      state: TicketState.PENDING_PICKUP_UNLINKED,
    },
    select: {
      id: true,
      incidentNumber: true,
      deviceId: true,
      schoolId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let mergedFromSynthetic = 0;
  let crossSchoolCollisions = 0;

  // Index synthetics by deviceId so we can find both same-school
  // matches AND cross-school collisions by serial.
  const synthByDevice = new Map<string, typeof synthetics>();
  for (const s of synthetics) {
    if (!s.deviceId) continue;
    const list = synthByDevice.get(s.deviceId) ?? [];
    list.push(s);
    synthByDevice.set(s.deviceId, list);
  }

  const mergedSyntheticIds = new Set<string>();

  for (const row of importedTickets) {
    const t = row.resultingTicket;
    if (!t || !t.deviceId) continue;
    const matches = synthByDevice.get(t.deviceId) ?? [];
    if (matches.length === 0) continue;

    const sameSchool = matches.filter((s) => s.schoolId === t.schoolId);
    const otherSchool = matches.filter((s) => s.schoolId !== t.schoolId);

    if (sameSchool.length > 0) {
      // Auto-merge the older synthetic into the imported INC.
      // mergeTicket() runs in its own transaction and writes the
      // merge comment + Ticket.merge audit + Ticket.device.transferred
      // audit rows that the brief's G7 ("never silent merge") and
      // operator-readable-trail invariants both depend on.
      const winner = sameSchool[0]!;
      try {
        await mergeTicket({
          sourceTicketId: winner.id,
          targetTicketId: t.id,
          actorUserId,
          reason: `SNOW import auto-merge (batch ${importBatchId})`,
        });
        mergedSyntheticIds.add(winner.id);
        mergedFromSynthetic++;
      } catch (err) {
        // The merge can throw if a concurrent operation just merged
        // either side — leave the synthetic open and log so an
        // operator can resolve manually via /duplicates.
        await writeAudit(
          {
            actorUserId,
            entityType: "Ticket",
            entityId: winner.id,
            action: "snow-merge.failed",
            after: {
              targetTicketId: t.id,
              error: err instanceof Error ? err.message : String(err),
              importBatchId,
            },
            reason: "Auto-merge failed; left for /duplicates resolution.",
            transitionType: "scheduled",
          },
          db,
        );
      }

      // Multi-synthetic edge case: post a comment on each loser.
      for (const loser of sameSchool.slice(1)) {
        await db.comment.create({
          data: {
            ticketId: loser.id,
            authorUserId: actorUserId,
            body:
              `Multiple synthetics found for this device + school; ` +
              `merged ${winner.incidentNumber} (older) into ${t.incidentNumber}. ` +
              `This synthetic stays open — review and resolve at /duplicates.`,
          },
        });
        await writeAudit(
          {
            actorUserId,
            entityType: "Ticket",
            entityId: loser.id,
            action: "snow-merge.runner-up",
            after: {
              winnerTicketId: winner.id,
              importedTicketId: t.id,
              importBatchId,
            },
            reason: "Multiple synthetics matched; older one merged.",
            transitionType: "scheduled",
          },
          db,
        );
      }
    }

    if (otherSchool.length > 0) {
      // Cross-school collision: the same serial appears on a synthetic
      // at a different school. We don't merge — the import creates its
      // INC at school B normally, and the synthetic at school A stays
      // open with a comment so an operator can investigate.
      for (const synth of otherSchool) {
        await db.comment.create({
          data: {
            ticketId: synth.id,
            authorUserId: actorUserId,
            body:
              `Cross-school serial collision: import ${t.incidentNumber} ` +
              `landed for the same device serial at a different school. ` +
              `This synthetic stays open. Investigate in /duplicates.`,
          },
        });
        await writeAudit(
          {
            actorUserId,
            entityType: "Ticket",
            entityId: synth.id,
            action: "snow-merge.cross-school-collision",
            after: {
              importedTicketId: t.id,
              importBatchId,
            },
            reason: "Same serial at different school — manual review.",
            transitionType: "scheduled",
          },
          db,
        );
        crossSchoolCollisions++;
      }
    }
  }

  const unmatchedSynthetics = synthetics.length - mergedSyntheticIds.size;

  return { mergedFromSynthetic, crossSchoolCollisions, unmatchedSynthetics };
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

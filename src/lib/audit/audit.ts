import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export interface AuditEntry {
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/**
 * Append-only audit log. All significant state changes should call this.
 * Intentionally simple: one row per action, no soft-delete semantics.
 */
export async function writeAudit(
  entry: AuditEntry,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
    },
  });
}

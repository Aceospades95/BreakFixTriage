/**
 * School portal tokens.
 *
 * A PortalToken is a magic link: an admin generates one on the
 * school profile page, shares the resulting URL with the school's
 * IT lead, and they bookmark it. Visiting the URL gives read-only
 * access to a status page for that one school without signing in.
 *
 * Security notes:
 *   - Tokens are 32 random bytes, base64url-encoded → ~43 chars.
 *     That's effectively unguessable.
 *   - Tokens are stored as-is (not hashed) because they are the
 *     only handle to the portal URL — if an attacker can read the
 *     DB, they already have everything. Hashing would just make
 *     legitimate revocation harder.
 *   - Revocation is soft (`revokedAt` timestamp) so ops can see
 *     which link they killed and when.
 *   - Tokens can optionally carry an `expiresAt` for rotating
 *     access. The verify function honors both revocation and
 *     expiry.
 */

import { randomBytes } from "node:crypto";
import type { PortalToken, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Cryptographically random portal token. 32 bytes of entropy
 * rendered as base64url — safe in URLs without encoding.
 */
export function generateTokenString(): string {
  return randomBytes(32).toString("base64url");
}

export interface CreatePortalTokenInput {
  schoolId: string;
  label?: string | null;
  expiresAt?: Date | null;
  actorUserId: string;
}

export async function createPortalToken(
  input: CreatePortalTokenInput,
  db: PrismaClient = defaultPrisma,
): Promise<PortalToken> {
  return db.$transaction(async (tx) => {
    const row = await tx.portalToken.create({
      data: {
        schoolId: input.schoolId,
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        token: generateTokenString(),
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "PortalToken",
        entityId: row.id,
        action: "create",
        after: {
          schoolId: input.schoolId,
          label: input.label ?? null,
          expiresAt: input.expiresAt?.toISOString() ?? null,
        },
      },
      tx,
    );
    return row;
  });
}

export interface RevokePortalTokenInput {
  tokenId: string;
  actorUserId: string;
}

export async function revokePortalToken(
  input: RevokePortalTokenInput,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.portalToken.update({
      where: { id: input.tokenId },
      data: { revokedAt: new Date() },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "PortalToken",
        entityId: input.tokenId,
        action: "revoke",
      },
      tx,
    );
  });
}

export interface ResolvedPortalToken {
  tokenId: string;
  schoolId: string;
  label: string | null;
}

/**
 * Look up a token string from an incoming request. Returns null for
 * anything invalid: missing, revoked, expired, or school inactive.
 * Stamps `lastUsedAt` on the way through so ops can see that a link
 * is still being used.
 */
export async function resolvePortalToken(
  rawToken: string,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<ResolvedPortalToken | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const row = await db.portalToken.findUnique({
    where: { token: rawToken },
    include: { school: { select: { active: true } } },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null;
  if (!row.school.active) return null;

  // Stamp lastUsedAt but don't block the caller on it.
  db.portalToken
    .update({ where: { id: row.id }, data: { lastUsedAt: now } })
    .catch(() => {
      /* best effort */
    });

  return {
    tokenId: row.id,
    schoolId: row.schoolId,
    label: row.label,
  };
}

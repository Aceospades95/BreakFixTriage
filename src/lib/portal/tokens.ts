/**
 * School portal tokens.
 *
 * A PortalToken is a magic link: an admin generates one on the
 * school profile page, shares the resulting URL with the school's
 * IT lead, and they bookmark it. Visiting the URL gives read-only
 * access to a status page for that one school without signing in.
 *
 * Round-13 §1I — security model:
 *   - Tokens are 32 random bytes, base64url-encoded → ~43 chars.
 *   - DB stores the SHA-256 HASH of the plaintext, never the
 *     plaintext itself. Plaintext is shown ONCE on creation and
 *     cannot be recovered.
 *   - First eight chars of the plaintext live in `tokenPrefix` so
 *     the operator UI can label rows ("xY4kP2mN…").
 *   - Default expiry is 365 days from creation when caller doesn't
 *     supply `ttlDays`.
 *   - Revocation is soft (`revokedAt` timestamp) so ops can see
 *     which link they killed and when.
 */

import { createHash, randomBytes } from "node:crypto";
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

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

const DEFAULT_TTL_DAYS = 365;

export interface CreatePortalTokenInput {
  schoolId: string;
  label?: string | null;
  expiresAt?: Date | null;
  ttlDays?: number;
  dataScope?: "STANDARD" | "MINIMAL";
  actorUserId: string;
}

export interface CreatePortalTokenResult {
  /** The PortalToken row (without the plaintext). */
  row: PortalToken;
  /**
   * The plaintext token, returned ONCE. Show it to the admin on
   * creation; never persist it. The DB only has its hash.
   */
  plaintext: string;
}

export async function createPortalToken(
  input: CreatePortalTokenInput,
  db: PrismaClient = defaultPrisma,
): Promise<CreatePortalTokenResult> {
  const plaintext = generateTokenString();
  const tokenHash = hashToken(plaintext);
  const tokenPrefix = plaintext.slice(0, 8);
  const ttlDays = Number.isFinite(input.ttlDays)
    ? Math.max(1, Math.floor(input.ttlDays as number))
    : DEFAULT_TTL_DAYS;
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const row = await db.$transaction(async (tx) => {
    const created = await tx.portalToken.create({
      data: {
        schoolId: input.schoolId,
        label: input.label ?? null,
        expiresAt,
        token: tokenHash,
        tokenPrefix,
        dataScope: input.dataScope ?? "STANDARD",
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "PortalToken",
        entityId: created.id,
        action: "create",
        after: {
          schoolId: input.schoolId,
          label: input.label ?? null,
          tokenPrefix,
          dataScope: input.dataScope ?? "STANDARD",
          expiresAt: expiresAt.toISOString(),
        },
        reason: "Portal token issued",
      },
      tx,
    );
    return created;
  });

  return { row, plaintext };
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
        reason: "Portal token revoked",
        severity: "warn",
      },
      tx,
    );
  });
}

export interface ResolvedPortalToken {
  tokenId: string;
  schoolId: string;
  label: string | null;
  dataScope: "STANDARD" | "MINIMAL";
}

/**
 * Look up a token from an incoming request. The user pastes the
 * plaintext into the URL; we hash it and look up by hash. Returns
 * null for anything invalid: missing, revoked, expired, or school
 * inactive.
 *
 * Stamps `lastUsedAt` on the way through so ops can see that a link
 * is still being used.
 */
export async function resolvePortalToken(
  rawToken: string,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<ResolvedPortalToken | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = hashToken(rawToken);
  const row = await db.portalToken.findUnique({
    where: { token: tokenHash },
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

  const dataScope = (row.dataScope === "MINIMAL" ? "MINIMAL" : "STANDARD") as
    | "STANDARD"
    | "MINIMAL";

  return {
    tokenId: row.id,
    schoolId: row.schoolId,
    label: row.label,
    dataScope,
  };
}

import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * UserSession write path + revocation gate.
 *
 * The /admin/users/[id] "Recent sessions" panel and the "Sign out
 * all sessions" affordance read/write the UserSession table. The
 * coarse revocation flag lives on User.sessionRevokedBefore and is
 * compared against the JWT's `iat` claim by `getSession()` and
 * `isJwtRevoked()` below. ADR 0015 covers the design choice.
 */

const SALT = process.env.AUTH_SESSION_SALT ?? "breakfix-default-session-salt";
const HASH_PREFIX_BYTES = 8; // 16 hex chars; enough to disambiguate

/** Debounce window: don't update lastSeenAt more than once per minute. */
const TOUCH_DEBOUNCE_MS = 60 * 1000;

/** Mirror of NextAuth maxAge (12h) so the expiresAt timestamp aligns. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashWithPrefix(prefix: string, value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digest = createHash("sha256")
    .update(`${SALT}:${prefix}:${trimmed}`)
    .digest("hex")
    .slice(0, HASH_PREFIX_BYTES * 2);
  return `${prefix}:${digest}`;
}

export function hashIp(ip: string | null): string | null {
  return hashWithPrefix("ip", ip);
}

export function hashUserAgent(ua: string | null): string | null {
  return hashWithPrefix("ua", ua);
}

/**
 * Compare a JWT's `iat` (issued-at, seconds since epoch) against the
 * user's `sessionRevokedBefore` timestamp. Returns true if the JWT
 * predates the revocation cutoff and should be rejected.
 *
 * Round-13 §1A — `getSession()` calls this on every authenticated
 * read so revoking sessions actually invalidates outstanding JWTs.
 */
export async function isJwtRevoked(
  userId: string,
  iatSeconds: number | undefined,
): Promise<boolean> {
  if (!iatSeconds || !Number.isFinite(iatSeconds)) {
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionRevokedBefore: true },
  });
  if (!user?.sessionRevokedBefore) return false;
  const cutoffSeconds = Math.floor(
    user.sessionRevokedBefore.getTime() / 1000,
  );
  return iatSeconds < cutoffSeconds;
}

/**
 * Update the most-recent active session for the user with fresh
 * lastSeenAt + ip/UA fingerprint. Debounced — at most one write
 * per minute per session.
 *
 * Returns false if the JWT predates `sessionRevokedBefore` so the
 * caller can short-circuit. Otherwise creates or updates the active
 * session row and returns true.
 */
export async function touchSession(
  userId: string,
  ip: string | null,
  ua: string | null,
  iatSeconds?: number,
): Promise<boolean> {
  if (await isJwtRevoked(userId, iatSeconds)) {
    return false;
  }
  const ipHash = hashIp(ip);
  const uaFingerprint = hashUserAgent(ua);
  const now = new Date();

  const active = await prisma.userSession.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, lastSeenAt: true, ipHash: true, uaFingerprint: true },
  });

  if (!active) {
    await prisma.userSession.create({
      data: {
        userId,
        ipHash,
        uaFingerprint,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    });
    return true;
  }

  const stale =
    now.getTime() - new Date(active.lastSeenAt).getTime() > TOUCH_DEBOUNCE_MS;
  // Update if stale OR if we now have a hash that wasn't recorded
  // before. The latter handles the bridge case where a session
  // created via the sign-in event has null ip/ua and the first
  // touched request can populate them.
  const newHashAvailable =
    (ipHash && !active.ipHash) || (uaFingerprint && !active.uaFingerprint);
  if (!stale && !newHashAvailable) return true;

  await prisma.userSession.update({
    where: { id: active.id },
    data: {
      lastSeenAt: now,
      ipHash: ipHash ?? active.ipHash,
      uaFingerprint: uaFingerprint ?? active.uaFingerprint,
    },
  });
  return true;
}

/**
 * Mark every active session for `userId` as revoked AND bump
 * `User.sessionRevokedBefore` so any JWT issued before this moment
 * is rejected on the next authenticated request. Returns the count
 * of UserSession rows actually flipped.
 *
 * Round-13 §1A — the schema flag plus revoking the per-row state
 * are atomic so a single transaction is the source of truth for
 * "this user signed out everywhere". ADR 0015.
 */
export async function revokeAllSessionsForUser(
  userId: string,
): Promise<number> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const result = await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.update({
      where: { id: userId },
      data: { sessionRevokedBefore: now },
    });
    return result.count;
  });
}

/**
 * Mark the user's most recent active session as revoked. Used by
 * the NextAuth signOut event so a deliberate sign-out closes the
 * "active" session row without nuking peers (the user might also
 * be signed in on another device).
 */
export async function revokeMostRecentSessionForUser(
  userId: string,
): Promise<void> {
  const active = await prisma.userSession.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
  });
  if (!active) return;
  await prisma.userSession.update({
    where: { id: active.id },
    data: { revokedAt: new Date() },
  });
}

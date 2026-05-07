import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Round-11 §1C — UserSession write path.
 *
 * The R10 schema landed but the panel always showed
 * "No sessions recorded yet" because the middleware that updates
 * lastSeenAt never ran. R11 wires the touch + privacy-aware
 * fingerprinting inside the (app) layout server component, which
 * runs in the Node runtime on every authenticated page request
 * (and therefore CAN reach Prisma — Edge middleware cannot).
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
 * Update the most-recent active session for the user with fresh
 * lastSeenAt + ip/UA fingerprint. Debounced — at most one write
 * per minute per session.
 *
 * If no active session exists (e.g. the sign-in event predates
 * R11 schema or the row was revoked), a new one is created so the
 * panel never goes silent for an active user.
 */
export async function touchSession(
  userId: string,
  ip: string | null,
  ua: string | null,
): Promise<void> {
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
    return;
  }

  const stale =
    now.getTime() - new Date(active.lastSeenAt).getTime() > TOUCH_DEBOUNCE_MS;
  // Update if stale OR if we now have a hash that wasn't recorded
  // before. The latter handles the bridge case where a session
  // created via the sign-in event has null ip/ua and the first
  // touched request can populate them.
  const newHashAvailable =
    (ipHash && !active.ipHash) || (uaFingerprint && !active.uaFingerprint);
  if (!stale && !newHashAvailable) return;

  await prisma.userSession.update({
    where: { id: active.id },
    data: {
      lastSeenAt: now,
      ipHash: ipHash ?? active.ipHash,
      uaFingerprint: uaFingerprint ?? active.uaFingerprint,
    },
  });
}

/**
 * Mark every active session for `userId` as revoked. Returns the
 * count of rows that were actually changed.
 */
export async function revokeAllSessionsForUser(
  userId: string,
): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
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

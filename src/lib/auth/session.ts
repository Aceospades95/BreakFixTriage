import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import {
  AuthorizationError,
  canAsync,
  type Permission,
} from "./rbac";

/**
 * Minimal session shape used by server code. This is intentionally decoupled
 * from NextAuth's types so tests and scripts can fabricate sessions without
 * pulling in the full NextAuth runtime.
 */
export interface BreakFixSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
  districtIds: string[];
}

/**
 * Read the current session, returning `null` if the user is not signed in
 * OR the JWT has been revoked via `User.sessionRevokedBefore` (Round-13
 * §1A). Prefer `requireSession()` in server components that assume a user.
 *
 * The revocation gate runs against the User table; cached JWTs from
 * before an admin "Sign out all sessions" or 2FA reset come back
 * unauthenticated even though NextAuth would otherwise honor them.
 */
export async function getSession(): Promise<BreakFixSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email || !session.user.name) {
    return null;
  }
  const iat = (session.user as { iat?: number }).iat;
  // Lazy import: avoid the server-only import chain in test contexts
  // that fabricate sessions without going through the auth module.
  const { isJwtRevoked } = await import("./sessions");
  if (await isJwtRevoked(session.user.id, iat)) {
    return null;
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    districtIds: session.user.districtIds,
  };
}

/**
 * Read the current session and redirect to sign-in if absent. Use in server
 * components and server actions that require an authenticated user.
 */
export async function requireSession(): Promise<BreakFixSession> {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session;
}

/**
 * Read the current session, ensure it satisfies every supplied permission,
 * and throw `AuthorizationError` otherwise. Use as the first line of a
 * server action or server component that performs a protected operation.
 */
export async function requireRole(
  ...permissions: Permission[]
): Promise<BreakFixSession> {
  const session = await requireSession();
  for (const perm of permissions) {
    if (!(await canAsync(session.role, perm))) {
      throw new AuthorizationError(session.role, perm);
    }
  }
  return session;
}

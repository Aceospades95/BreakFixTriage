import type { Role } from "@prisma/client";

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
 * Placeholder for "who is the current user?" server-side. Phase 1 replaces
 * this with a real NextAuth `getServerSession()` call. For now, server code
 * that needs a session should receive it as a parameter; nothing in Phase 0
 * tries to read the current user from thin air.
 */
export async function requireSession(): Promise<BreakFixSession> {
  throw new Error(
    "requireSession() is not wired up yet. Phase 1 will connect NextAuth.",
  );
}

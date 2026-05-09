import { Role } from "@prisma/client";

/**
 * Permission constants. Kept as a flat string set rather than a nested
 * matrix because it's easier to grep.
 */
export const PERMISSIONS = {
  TICKETS_READ: "tickets:read",
  TICKETS_WRITE: "tickets:write",
  TICKETS_TRANSITION: "tickets:transition",
  IMPORTS_RUN: "imports:run",
  IMPORTS_READ: "imports:read",
  DUPLICATES_RESOLVE: "duplicates:resolve",
  SCHEDULING_READ: "scheduling:read",
  SCHEDULING_WRITE: "scheduling:write",
  ROUTES_BUILD: "routes:build",
  STOPS_UPDATE: "stops:update",
  QUOTES_READ: "quotes:read",
  QUOTES_WRITE: "quotes:write",
  USERS_MANAGE: "users:manage",
  DISTRICTS_MANAGE: "districts:manage",
  REPORTS_READ: "reports:read",
  // Round-2 §8 — email-rules engine permissions. EMAIL_READ scopes
  // to email logs visible against a ticket the actor can already
  // read; server-side enforcement is the ticket-level read check.
  EMAIL_READ: "email:read",
  EMAIL_WRITE: "email:write",
  EMAIL_SEND_TEST: "email:send_test",
  EMAIL_RULES_MANAGE: "email:rules_manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const READ_ONLY_SET: readonly Permission[] = [
  PERMISSIONS.TICKETS_READ,
  PERMISSIONS.IMPORTS_READ,
  PERMISSIONS.SCHEDULING_READ,
  PERMISSIONS.QUOTES_READ,
  PERMISSIONS.REPORTS_READ,
  // EMAIL_READ is in the read-only set: every role that can see a
  // ticket can see the EmailLog rows attached to that ticket.
  // Cross-ticket browsing on /admin/email-log is gated separately
  // by EMAIL_WRITE on the route handler.
  PERMISSIONS.EMAIL_READ,
];

/**
 * Default role → permissions mapping. These are the built-in defaults
 * which can be overridden per-role via the admin permission editor.
 * Admin always gets all permissions regardless of overrides.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: Object.values(PERMISSIONS),
  OPS_MANAGER: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_WRITE,
    PERMISSIONS.TICKETS_TRANSITION,
    PERMISSIONS.IMPORTS_RUN,
    PERMISSIONS.DUPLICATES_RESOLVE,
    PERMISSIONS.SCHEDULING_WRITE,
    PERMISSIONS.ROUTES_BUILD,
    PERMISSIONS.STOPS_UPDATE,
    PERMISSIONS.QUOTES_WRITE,
    // Round-2 §8: ops manager can edit templates / inspect logs /
    // run test sends. Rule manage stays admin-only — adding /
    // disabling rules can blast the wrong audience if misused.
    PERMISSIONS.EMAIL_WRITE,
    PERMISSIONS.EMAIL_SEND_TEST,
  ],
  DISPATCHER: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_TRANSITION,
    PERMISSIONS.SCHEDULING_WRITE,
    PERMISSIONS.ROUTES_BUILD,
    PERMISSIONS.STOPS_UPDATE,
  ],
  WAREHOUSE: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_TRANSITION,
  ],
  TECHNICIAN: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_TRANSITION,
  ],
  DRIVER: [
    PERMISSIONS.TICKETS_READ,
    PERMISSIONS.SCHEDULING_READ,
    PERMISSIONS.STOPS_UPDATE,
  ],
  READ_ONLY: READ_ONLY_SET,
};

/** Backwards compat alias */
export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

/**
 * Runtime permission overrides loaded from the database.
 * Set by `loadPermissionOverrides()` on first check or admin save.
 * `undefined` means "not yet loaded", `null` means "loaded, no overrides".
 */
let overrides: Record<string, Permission[]> | null | undefined = undefined;
let loadPromise: Promise<void> | null = null;

export function setPermissionOverrides(
  o: Record<string, Permission[]> | null,
) {
  overrides = o;
}

export function getPermissionOverrides(): Record<string, Permission[]> | null {
  return overrides ?? null;
}

/**
 * Lazy-load overrides from the database on first access.
 * Subsequent calls use the cached value.
 */
async function ensureOverridesLoaded() {
  if (overrides !== undefined) return;
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = (async () => {
    try {
      // Dynamic import to avoid circular deps
      const { prisma } = await import("@/lib/db/prisma");
      const setting = await prisma.appSetting.findUnique({
        where: { key: "role_permission_overrides" },
      });
      if (!setting) {
        overrides = null;
        return;
      }
      const parsed = JSON.parse(setting.value) as Record<string, string[]>;
      const allPerms = Object.values(PERMISSIONS);
      const validated: Record<string, Permission[]> = {};
      for (const [role, perms] of Object.entries(parsed)) {
        validated[role] = perms.filter((p): p is Permission =>
          allPerms.includes(p as Permission),
        );
      }
      overrides = validated;
    } catch {
      overrides = null;
    }
  })();
  await loadPromise;
  loadPromise = null;
}

export function getEffectivePermissions(role: Role): readonly Permission[] {
  // Admin always has all permissions
  if (role === "ADMIN") return Object.values(PERMISSIONS);
  if (overrides && overrides[role]) return overrides[role];
  return DEFAULT_ROLE_PERMISSIONS[role];
}

/**
 * Check if a role has a given permission. Synchronous — uses cached
 * overrides. Call `ensureOverridesLoaded()` first in async contexts.
 */
export function can(role: Role, permission: Permission): boolean {
  return getEffectivePermissions(role).includes(permission);
}

/**
 * Async version of `can()` that ensures overrides are loaded first.
 */
export async function canAsync(role: Role, permission: Permission): Promise<boolean> {
  await ensureOverridesLoaded();
  return can(role, permission);
}

export class AuthorizationError extends Error {
  constructor(
    readonly role: Role,
    readonly permission: Permission,
  ) {
    super(`Role ${role} is not permitted to perform ${permission}`);
    this.name = "AuthorizationError";
  }
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new AuthorizationError(role, permission);
  }
}

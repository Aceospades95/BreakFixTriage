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
  QUOTES_READ: "quotes:read",
  QUOTES_WRITE: "quotes:write",
  USERS_MANAGE: "users:manage",
  DISTRICTS_MANAGE: "districts:manage",
  REPORTS_READ: "reports:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const READ_ONLY_SET: readonly Permission[] = [
  PERMISSIONS.TICKETS_READ,
  PERMISSIONS.IMPORTS_READ,
  PERMISSIONS.SCHEDULING_READ,
  PERMISSIONS.QUOTES_READ,
  PERMISSIONS.REPORTS_READ,
];

/**
 * Role → permissions mapping. Intentionally static; changes are code
 * changes, not runtime configuration, because auditability matters more
 * than flexibility here.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: Object.values(PERMISSIONS),
  OPS_MANAGER: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_WRITE,
    PERMISSIONS.TICKETS_TRANSITION,
    PERMISSIONS.IMPORTS_RUN,
    PERMISSIONS.DUPLICATES_RESOLVE,
    PERMISSIONS.SCHEDULING_WRITE,
    PERMISSIONS.ROUTES_BUILD,
    PERMISSIONS.QUOTES_WRITE,
  ],
  DISPATCHER: [
    ...READ_ONLY_SET,
    PERMISSIONS.TICKETS_TRANSITION,
    PERMISSIONS.SCHEDULING_WRITE,
    PERMISSIONS.ROUTES_BUILD,
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
  ],
  READ_ONLY: READ_ONLY_SET,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
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

import { Role } from "@prisma/client";

/**
 * Roles that can be assigned to run a route. Shared by the
 * new-route builder, the route-detail driver control, and the
 * reassignment action so the three can't drift apart.
 */
export const DRIVER_ROLES: Role[] = [
  Role.DRIVER,
  Role.TECHNICIAN,
  Role.OPS_MANAGER,
  Role.DISPATCHER,
  Role.ADMIN,
];

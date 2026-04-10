import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import {
  AuthorizationError,
  PERMISSIONS,
  can,
  requirePermission,
} from "@/lib/auth/rbac";

describe("rbac", () => {
  it("admin can do everything", () => {
    for (const perm of Object.values(PERMISSIONS)) {
      expect(can(Role.ADMIN, perm)).toBe(true);
    }
  });

  it("read-only can read but not write", () => {
    expect(can(Role.READ_ONLY, PERMISSIONS.TICKETS_READ)).toBe(true);
    expect(can(Role.READ_ONLY, PERMISSIONS.TICKETS_WRITE)).toBe(false);
    expect(can(Role.READ_ONLY, PERMISSIONS.ROUTES_BUILD)).toBe(false);
  });

  it("driver can see scheduling and update stops but not build routes", () => {
    expect(can(Role.DRIVER, PERMISSIONS.SCHEDULING_READ)).toBe(true);
    expect(can(Role.DRIVER, PERMISSIONS.STOPS_UPDATE)).toBe(true);
    expect(can(Role.DRIVER, PERMISSIONS.ROUTES_BUILD)).toBe(false);
    expect(can(Role.DRIVER, PERMISSIONS.SCHEDULING_WRITE)).toBe(false);
  });

  it("dispatcher can build routes", () => {
    expect(can(Role.DISPATCHER, PERMISSIONS.ROUTES_BUILD)).toBe(true);
    expect(can(Role.DISPATCHER, PERMISSIONS.SCHEDULING_WRITE)).toBe(true);
  });

  it("warehouse cannot manage users", () => {
    expect(can(Role.WAREHOUSE, PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it("requirePermission throws for denied role", () => {
    expect(() =>
      requirePermission(Role.READ_ONLY, PERMISSIONS.TICKETS_WRITE),
    ).toThrow(AuthorizationError);
  });

  it("requirePermission is silent for allowed role", () => {
    expect(() =>
      requirePermission(Role.OPS_MANAGER, PERMISSIONS.TICKETS_WRITE),
    ).not.toThrow();
  });
});

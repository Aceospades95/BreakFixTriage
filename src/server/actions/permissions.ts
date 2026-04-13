"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import {
  PERMISSIONS,
  type Permission,
  setPermissionOverrides,
} from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

const SETTING_KEY = "role_permission_overrides";
const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const ALL_ROLES: Role[] = [
  "OPS_MANAGER",
  "DISPATCHER",
  "WAREHOUSE",
  "TECHNICIAN",
  "DRIVER",
  "READ_ONLY",
];

/**
 * Load permission overrides from the database and set them in the
 * RBAC module. Called on first request and after saving changes.
 */
export async function loadPermissionOverrides() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  if (!setting) {
    setPermissionOverrides(null);
    return;
  }
  try {
    const parsed = JSON.parse(setting.value) as Record<string, string[]>;
    // Validate that all values are valid permissions
    const validated: Record<string, Permission[]> = {};
    for (const [role, perms] of Object.entries(parsed)) {
      if (!ALL_ROLES.includes(role as Role)) continue;
      validated[role] = perms.filter((p): p is Permission =>
        ALL_PERMISSIONS.includes(p as Permission),
      );
    }
    setPermissionOverrides(validated);
  } catch {
    setPermissionOverrides(null);
  }
}

/**
 * Save role permission overrides from the admin permission editor form.
 */
export async function savePermissionsAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const overrides: Record<string, Permission[]> = {};

  for (const role of ALL_ROLES) {
    const perms: Permission[] = [];
    for (const perm of ALL_PERMISSIONS) {
      const key = `${role}__${perm}`;
      if (formData.get(key) === "on") {
        perms.push(perm);
      }
    }
    overrides[role] = perms;
  }

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(overrides),
      updatedByUserId: session.userId,
    },
    update: {
      value: JSON.stringify(overrides),
      updatedByUserId: session.userId,
    },
  });

  // Reload overrides into memory
  setPermissionOverrides(overrides);

  await writeAudit({
    actorUserId: session.userId,
    entityType: "AppSetting",
    entityId: SETTING_KEY,
    action: "permissions:updated",
    after: overrides,
  });

  revalidatePath("/admin/permissions");
  redirect("/admin/permissions?saved=1");
}

/**
 * Reset all permissions to defaults by removing the override.
 */
export async function resetPermissionsAction() {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  await prisma.appSetting.deleteMany({
    where: { key: SETTING_KEY },
  });

  setPermissionOverrides(null);

  await writeAudit({
    actorUserId: session.userId,
    entityType: "AppSetting",
    entityId: SETTING_KEY,
    action: "permissions:reset",
  });

  revalidatePath("/admin/permissions");
  redirect("/admin/permissions?reset=1");
}

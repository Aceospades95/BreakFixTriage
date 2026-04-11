"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { FormFactor, Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from "@/lib/auth/password-policy";
import { errorRedirectWithForm } from "@/lib/forms/preserve";

/**
 * Admin CRUD actions.
 *
 * Every entity type (users, schools, contacts, devices, districts,
 * device models) has create + update. Delete is intentionally
 * limited — real ops never deletes a school, they deactivate it.
 *
 * All actions write an AuditLog row. All redirect back to the
 * entity's list page on success, or to the same page with an
 * `?error=` query string on failure.
 */

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  role: z.nativeEnum(Role),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH),
  districtIds: z.array(z.string()).default([]),
});

export async function createUserAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const districtIds = formData
    .getAll("districtIds")
    .map((v) => v.toString())
    .filter(Boolean);

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    password: formData.get("password"),
    districtIds,
  });
  // Fields allowed to round-trip through the preserved-form query
  // param. Password is intentionally excluded so it doesn't leak back
  // into the URL on validation errors.
  const preservedFields = ["email", "name", "role", "districtIds"] as const;

  if (!parsed.success) {
    redirect(
      errorRedirectWithForm(
        "/admin/users/new",
        parsed.error.issues.map((i) => i.message).join("; "),
        formData,
        preservedFields,
      ),
    );
  }

  const policyCheck = validatePassword(parsed.data.password);
  if (!policyCheck.ok) {
    redirect(
      errorRedirectWithForm(
        "/admin/users/new",
        `Password ${policyCheck.errors.join("; ")}`,
        formData,
        preservedFields,
      ),
    );
  }

  let errorMessage: string | null = null;
  let createdId: string | null = null;
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash,
        active: true,
        districts: {
          create: parsed.data.districtIds.map((districtId) => ({
            districtId,
          })),
        },
      },
    });
    createdId = user.id;
    await writeAudit({
      actorUserId: session.userId,
      entityType: "User",
      entityId: user.id,
      action: "create",
      after: {
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/users/new", errorMessage);

  revalidatePath("/admin/users");
  redirect(createdId ? `/admin/users/${createdId}` : "/admin/users");
}

const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  districtIds: z.array(z.string()).optional(),
});

export async function updateUserAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const districtIds = formData.has("districtIds[]")
    ? formData
        .getAll("districtIds[]")
        .map((v) => v.toString())
        .filter(Boolean)
    : formData
        .getAll("districtIds")
        .map((v) => v.toString())
        .filter(Boolean);

  const parsed = updateUserSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    role: formData.get("role") || undefined,
    active: formData.has("active")
      ? formData.get("active") === "true"
      : undefined,
    districtIds: formData.has("districtIds") || formData.has("districtIds[]")
      ? districtIds
      : undefined,
  });
  if (!parsed.success) {
    const id = formData.get("id")?.toString() ?? "";
    flashError(`/admin/users/${id}`, "Invalid update");
  }

  let errorMessage: string | null = null;
  try {
    const existing = await prisma.user.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) {
      errorMessage = "User not found";
    } else {
      await prisma.user.update({
        where: { id: parsed.data.id },
        data: {
          name: parsed.data.name ?? undefined,
          role: parsed.data.role ?? undefined,
          active: parsed.data.active ?? undefined,
        },
      });
      if (parsed.data.districtIds !== undefined) {
        await prisma.districtUser.deleteMany({
          where: { userId: parsed.data.id },
        });
        for (const districtId of parsed.data.districtIds) {
          await prisma.districtUser.create({
            data: { userId: parsed.data.id, districtId },
          });
        }
      }
      await writeAudit({
        actorUserId: session.userId,
        entityType: "User",
        entityId: parsed.data.id,
        action: "update",
        before: {
          name: existing.name,
          role: existing.role,
          active: existing.active,
        },
        after: {
          name: parsed.data.name ?? existing.name,
          role: parsed.data.role ?? existing.role,
          active: parsed.data.active ?? existing.active,
        },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
  }
  if (errorMessage) flashError(`/admin/users/${parsed.data.id}`, errorMessage);

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
  redirect(`/admin/users/${parsed.data.id}`);
}

const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export async function resetUserPasswordAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);
  const parsed = resetPasswordSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const id = formData.get("id")?.toString() ?? "";
    flashError(
      `/admin/users/${id}`,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  const policyCheck = validatePassword(parsed.data.password);
  if (!policyCheck.ok) {
    flashError(
      `/admin/users/${parsed.data.id}`,
      `Password ${policyCheck.errors.join("; ")}`,
    );
  }
  let errorMessage: string | null = null;
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { passwordHash },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "User",
      entityId: parsed.data.id,
      action: "reset-password",
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Reset failed";
  }
  if (errorMessage) flashError(`/admin/users/${parsed.data.id}`, errorMessage);

  redirect(
    `/admin/users/${parsed.data.id}?ok=${encodeURIComponent("Password reset")}`,
  );
}

// ---------------------------------------------------------------------------
// Self-service password change (any signed-in user)
// ---------------------------------------------------------------------------

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    confirmPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changeOwnPasswordAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ); // any signed-in user

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    flashError(
      "/profile",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  const policyCheck = validatePassword(parsed.data.newPassword);
  if (!policyCheck.ok) {
    flashError(
      "/profile",
      `New password ${policyCheck.errors.join("; ")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user?.passwordHash) {
      errorMessage = "Your account has no password (SSO only)";
    } else {
      const ok = await bcrypt.compare(
        parsed.data.currentPassword,
        user.passwordHash,
      );
      if (!ok) {
        errorMessage = "Current password is incorrect";
      } else {
        const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });
        await writeAudit({
          actorUserId: session.userId,
          entityType: "User",
          entityId: user.id,
          action: "self-change-password",
        });
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
  }
  if (errorMessage) flashError("/profile", errorMessage);

  redirect("/profile?ok=" + encodeURIComponent("Password updated"));
}

// ---------------------------------------------------------------------------
// Districts
// ---------------------------------------------------------------------------

const districtSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
  region: z.string().trim().max(50).optional(),
});

export async function createDistrictAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = districtSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    region: formData.get("region")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError(
      "/admin/districts",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }
  let errorMessage: string | null = null;
  try {
    const d = await prisma.district.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code.toUpperCase(),
        region: parsed.data.region ?? null,
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "District",
      entityId: d.id,
      action: "create",
      after: { name: d.name, code: d.code },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/districts", errorMessage);

  revalidatePath("/admin/districts");
  redirect("/admin/districts");
}

// ---------------------------------------------------------------------------
// Schools
// ---------------------------------------------------------------------------

const schoolSchema = z.object({
  districtId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(20).optional(),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
  postalCode: z.string().trim().min(3).max(10),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export async function createSchoolAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = schoolSchema.safeParse({
    districtId: formData.get("districtId"),
    name: formData.get("name"),
    code: formData.get("code")?.toString() || undefined,
    line1: formData.get("line1"),
    line2: formData.get("line2")?.toString() || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
  });
  if (!parsed.success) {
    redirect(
      errorRedirectWithForm(
        "/admin/schools/new",
        parsed.error.issues.map((i) => i.message).join("; "),
        formData,
      ),
    );
  }

  let errorMessage: string | null = null;
  let createdId: string | null = null;
  try {
    const address = await prisma.address.create({
      data: {
        line1: parsed.data.line1,
        line2: parsed.data.line2 ?? null,
        city: parsed.data.city,
        state: parsed.data.state.toUpperCase(),
        postalCode: parsed.data.postalCode,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    });
    const school = await prisma.school.create({
      data: {
        districtId: parsed.data.districtId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        addressId: address.id,
      },
    });
    createdId = school.id;
    await writeAudit({
      actorUserId: session.userId,
      entityType: "School",
      entityId: school.id,
      action: "create",
      after: { name: school.name, code: school.code },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/schools/new", errorMessage);

  revalidatePath("/admin/schools");
  redirect(createdId ? `/admin/schools/${createdId}` : "/admin/schools");
}

const updateSchoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().max(20).nullable().optional(),
  line1: z.string().trim().min(1).max(200).optional(),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().length(2).optional(),
  postalCode: z.string().trim().min(3).max(10).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  active: z.boolean().optional(),
});

export async function updateSchoolAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = updateSchoolSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    code: formData.has("code") ? (formData.get("code")?.toString() || null) : undefined,
    line1: formData.get("line1") || undefined,
    line2: formData.has("line2") ? (formData.get("line2")?.toString() || null) : undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    active: formData.has("active")
      ? formData.get("active") === "true"
      : undefined,
  });
  if (!parsed.success) {
    const id = formData.get("id")?.toString() ?? "";
    flashError(`/admin/schools/${id}`, "Invalid update");
  }
  let errorMessage: string | null = null;
  try {
    const existing = await prisma.school.findUnique({
      where: { id: parsed.data.id },
      include: { address: true },
    });
    if (!existing) {
      errorMessage = "School not found";
    } else {
      const schoolData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) schoolData.name = parsed.data.name;
      if (parsed.data.code !== undefined) schoolData.code = parsed.data.code;
      if (parsed.data.active !== undefined) schoolData.active = parsed.data.active;
      if (Object.keys(schoolData).length > 0) {
        await prisma.school.update({
          where: { id: parsed.data.id },
          data: schoolData,
        });
      }

      const addressData: Record<string, unknown> = {};
      if (parsed.data.line1 !== undefined) addressData.line1 = parsed.data.line1;
      if (parsed.data.line2 !== undefined) addressData.line2 = parsed.data.line2;
      if (parsed.data.city !== undefined) addressData.city = parsed.data.city;
      if (parsed.data.state !== undefined)
        addressData.state = parsed.data.state.toUpperCase();
      if (parsed.data.postalCode !== undefined)
        addressData.postalCode = parsed.data.postalCode;
      if (parsed.data.latitude !== undefined)
        addressData.latitude = parsed.data.latitude;
      if (parsed.data.longitude !== undefined)
        addressData.longitude = parsed.data.longitude;

      if (Object.keys(addressData).length > 0) {
        if (existing.addressId) {
          await prisma.address.update({
            where: { id: existing.addressId },
            data: addressData,
          });
        } else {
          const addr = await prisma.address.create({
            data: {
              line1: parsed.data.line1 ?? "",
              line2: parsed.data.line2 ?? null,
              city: parsed.data.city ?? "",
              state: (parsed.data.state ?? "NY").toUpperCase(),
              postalCode: parsed.data.postalCode ?? "",
              latitude: parsed.data.latitude ?? null,
              longitude: parsed.data.longitude ?? null,
            },
          });
          await prisma.school.update({
            where: { id: parsed.data.id },
            data: { addressId: addr.id },
          });
        }
      }

      await writeAudit({
        actorUserId: session.userId,
        entityType: "School",
        entityId: parsed.data.id,
        action: "update",
        before: { name: existing.name, code: existing.code },
        after: {
          name: parsed.data.name ?? existing.name,
          code: parsed.data.code ?? existing.code,
        },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
  }
  if (errorMessage)
    flashError(`/admin/schools/${parsed.data.id}`, errorMessage);

  revalidatePath("/admin/schools");
  revalidatePath(`/admin/schools/${parsed.data.id}`);
  redirect(`/admin/schools/${parsed.data.id}`);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  isPrimary: z.boolean().optional(),
});

export async function createContactAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = contactSchema.safeParse({
    schoolId: formData.get("schoolId"),
    name: formData.get("name"),
    title: formData.get("title")?.toString() || undefined,
    email: formData.get("email")?.toString() || undefined,
    phone: formData.get("phone")?.toString() || undefined,
    isPrimary: formData.get("isPrimary") === "on",
  });
  if (!parsed.success) {
    const sid = formData.get("schoolId")?.toString() ?? "";
    flashError(
      `/admin/schools/${sid}`,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }
  let errorMessage: string | null = null;
  try {
    const contact = await prisma.contact.create({
      data: {
        schoolId: parsed.data.schoolId,
        name: parsed.data.name,
        title: parsed.data.title ?? null,
        email: parsed.data.email || null,
        phone: parsed.data.phone ?? null,
        isPrimary: parsed.data.isPrimary ?? false,
      },
    });
    if (parsed.data.isPrimary) {
      await prisma.school.update({
        where: { id: parsed.data.schoolId },
        data: { mainContactId: contact.id },
      });
    }
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Contact",
      entityId: contact.id,
      action: "create",
      after: {
        schoolId: parsed.data.schoolId,
        name: contact.name,
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage)
    flashError(`/admin/schools/${parsed.data.schoolId}`, errorMessage);

  revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
  redirect(`/admin/schools/${parsed.data.schoolId}`);
}

const setMainContactSchema = z.object({
  schoolId: z.string().min(1),
  contactId: z.string().min(1),
});

export async function setMainContactAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = setMainContactSchema.safeParse({
    schoolId: formData.get("schoolId"),
    contactId: formData.get("contactId"),
  });
  if (!parsed.success) {
    flashError("/admin/schools", "Invalid request");
  }
  try {
    await prisma.school.update({
      where: { id: parsed.data.schoolId },
      data: { mainContactId: parsed.data.contactId },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "School",
      entityId: parsed.data.schoolId,
      action: "set-main-contact",
      after: { contactId: parsed.data.contactId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    flashError(`/admin/schools/${parsed.data.schoolId}`, msg);
  }
  revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
  redirect(`/admin/schools/${parsed.data.schoolId}`);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

const deviceSchema = z.object({
  serialNumber: z.string().trim().min(1).max(100),
  assetTag: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  modelName: z.string().trim().max(100).optional(),
  formFactor: z.nativeEnum(FormFactor).optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional(),
  ownerSchoolId: z.string().optional(),
});

export async function createDeviceAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const parsed = deviceSchema.safeParse({
    serialNumber: formData.get("serialNumber"),
    assetTag: formData.get("assetTag")?.toString() || undefined,
    manufacturer: formData.get("manufacturer")?.toString() || undefined,
    modelName: formData.get("modelName")?.toString() || undefined,
    formFactor: formData.get("formFactor") || undefined,
    warrantyMonths: formData.get("warrantyMonths") || undefined,
    ownerSchoolId: formData.get("ownerSchoolId")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError(
      "/admin/devices/new",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }
  let errorMessage: string | null = null;
  let createdId: string | null = null;
  try {
    let modelId: string | undefined;
    if (parsed.data.manufacturer && parsed.data.modelName) {
      const model = await prisma.deviceModel.upsert({
        where: {
          manufacturer_modelName: {
            manufacturer: parsed.data.manufacturer,
            modelName: parsed.data.modelName,
          },
        },
        create: {
          manufacturer: parsed.data.manufacturer,
          modelName: parsed.data.modelName,
          formFactor: parsed.data.formFactor ?? "OTHER",
          warrantyMonths: parsed.data.warrantyMonths ?? null,
        },
        update: {
          formFactor: parsed.data.formFactor ?? undefined,
          warrantyMonths: parsed.data.warrantyMonths ?? undefined,
        },
      });
      modelId = model.id;
    }
    const device = await prisma.device.create({
      data: {
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        modelId: modelId ?? null,
        ownerSchoolId: parsed.data.ownerSchoolId ?? null,
      },
    });
    createdId = device.id;
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Device",
      entityId: device.id,
      action: "create",
      after: {
        serialNumber: device.serialNumber,
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/devices/new", errorMessage);

  revalidatePath("/admin/devices");
  redirect(createdId ? `/admin/devices/${createdId}` : "/admin/devices");
}

// ---------------------------------------------------------------------------
// Device model edits (Phase 8: repair notes / knowledge base)
// ---------------------------------------------------------------------------

const updateDeviceModelSchema = z.object({
  id: z.string().min(1),
  repairNotes: z.string().max(20000).optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional(),
});

/**
 * Update a device model's repair notes (the per-model knowledge
 * base) and optionally its warranty months. Admins manage the
 * shared "how do we fix an Acme EduBook 14" tips here; every tech
 * sees them on the ticket detail panel when the device model
 * matches.
 */
export async function updateDeviceModelAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const parsed = updateDeviceModelSchema.safeParse({
    id: formData.get("id"),
    repairNotes: formData.get("repairNotes")?.toString() || undefined,
    warrantyMonths: formData.get("warrantyMonths") || undefined,
  });
  if (!parsed.success) {
    const id = formData.get("id")?.toString() ?? "";
    flashError(`/admin/device-models/${id}`, "Invalid update");
  }

  let errorMessage: string | null = null;
  try {
    const existing = await prisma.deviceModel.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) {
      errorMessage = "Device model not found";
    } else {
      await prisma.deviceModel.update({
        where: { id: parsed.data.id },
        data: {
          repairNotes:
            parsed.data.repairNotes !== undefined
              ? parsed.data.repairNotes || null
              : undefined,
          warrantyMonths: parsed.data.warrantyMonths ?? undefined,
        },
      });
      await writeAudit({
        actorUserId: session.userId,
        entityType: "DeviceModel",
        entityId: parsed.data.id,
        action: "update",
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Update failed";
  }
  if (errorMessage)
    flashError(`/admin/device-models/${parsed.data.id}`, errorMessage);

  revalidatePath("/admin/device-models");
  revalidatePath(`/admin/device-models/${parsed.data.id}`);
  redirect(`/admin/device-models/${parsed.data.id}`);
}

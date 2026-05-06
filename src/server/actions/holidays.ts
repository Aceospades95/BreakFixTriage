"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HolidayScope } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

/**
 * Round-3 §A2 — holidays admin.
 *
 * Holiday rows feed the business-hours SLA math (Round-2 §12 /
 * ADR 0008). Scope is GLOBAL (every district) or DISTRICT (one
 * district id; SLA for tickets in other districts ignores the
 * row).
 *
 * Every CRUD writes an audit row with field diff.
 */

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  date: z.coerce.date(),
  label: z.string().trim().min(1).max(120),
  scope: z.nativeEnum(HolidayScope),
  scopeId: z.string().min(1).nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function upsertHolidayAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const parsed = upsertSchema.safeParse({
    id: formData.get("id")?.toString() || undefined,
    date: formData.get("date"),
    label: formData.get("label")?.toString() ?? "",
    scope: formData.get("scope"),
    scopeId:
      formData.get("scopeId")?.toString() && formData.get("scope") !== "GLOBAL"
        ? formData.get("scopeId")?.toString()
        : null,
  });
  if (!parsed.success) {
    redirect(
      `/admin/holidays?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; "))}`,
    );
  }

  if (parsed.data.id) {
    const before = await prisma.holiday.findUnique({
      where: { id: parsed.data.id },
    });
    const updated = await prisma.holiday.update({
      where: { id: parsed.data.id },
      data: {
        date: parsed.data.date,
        label: parsed.data.label,
        scope: parsed.data.scope,
        scopeId:
          parsed.data.scope === HolidayScope.GLOBAL
            ? null
            : (parsed.data.scopeId ?? null),
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Holiday",
      entityId: updated.id,
      action: "update",
      before: before
        ? {
            date: before.date.toISOString().slice(0, 10),
            label: before.label,
            scope: before.scope,
            scopeId: before.scopeId ?? null,
          }
        : null,
      after: {
        date: updated.date.toISOString().slice(0, 10),
        label: updated.label,
        scope: updated.scope,
        scopeId: updated.scopeId ?? null,
      },
    });
  } else {
    const created = await prisma.holiday.create({
      data: {
        date: parsed.data.date,
        label: parsed.data.label,
        scope: parsed.data.scope,
        scopeId:
          parsed.data.scope === HolidayScope.GLOBAL
            ? null
            : (parsed.data.scopeId ?? null),
      },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Holiday",
      entityId: created.id,
      action: "create",
      after: {
        date: created.date.toISOString().slice(0, 10),
        label: created.label,
        scope: created.scope,
        scopeId: created.scopeId ?? null,
      },
    });
  }

  revalidatePath("/admin/holidays");
  redirect("/admin/holidays?ok=Holiday+saved");
}

export async function deleteHolidayAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.USERS_MANAGE);

  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    redirect(`/admin/holidays?error=${encodeURIComponent("Invalid id")}`);
  }

  const before = await prisma.holiday.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    redirect(`/admin/holidays?error=${encodeURIComponent("Not found")}`);
  }
  await prisma.holiday.delete({ where: { id: parsed.data.id } });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "Holiday",
    entityId: parsed.data.id,
    action: "delete",
    before: before
      ? {
          date: before.date.toISOString().slice(0, 10),
          label: before.label,
          scope: before.scope,
          scopeId: before.scopeId ?? null,
        }
      : null,
  });

  revalidatePath("/admin/holidays");
  redirect("/admin/holidays?ok=Holiday+deleted");
}

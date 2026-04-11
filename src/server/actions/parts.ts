"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PartMovementKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { applyPartMovement, recordPartUsage } from "@/lib/parts/inventory";

/**
 * Parts admin actions.
 *
 * Create/update/retire go through DISTRICTS_MANAGE (admin only).
 * Stock movements (receive, adjust, scrap, return) go through
 * WAREHOUSE-capable roles via TICKETS_WRITE, which is a
 * conservative choice — tightening to a new PARTS_WRITE permission
 * is easy if ops complains.
 *
 * `recordPartUsageAction` is called from the ticket detail panel
 * and only requires TICKETS_WRITE because it's part of the repair
 * workflow, not the inventory admin surface.
 */

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// createPartAction
// ---------------------------------------------------------------------------

const createPartSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  reorderLevel: z.coerce.number().int().min(0).max(10000).optional(),
  costCents: z.coerce.number().int().min(0).optional(),
  location: z.string().trim().max(100).optional(),
  modelIds: z.array(z.string()).default([]),
});

export async function createPartAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const modelIds = formData
    .getAll("modelIds")
    .map((v) => v.toString())
    .filter(Boolean);

  const parsed = createPartSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    description: formData.get("description")?.toString() || undefined,
    reorderLevel: formData.get("reorderLevel") || undefined,
    costCents: (() => {
      const raw = formData.get("costDollars")?.toString();
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.round(n * 100) : undefined;
    })(),
    location: formData.get("location")?.toString() || undefined,
    modelIds,
  });
  if (!parsed.success) {
    flashError(
      "/admin/parts/new",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let createdId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const part = await prisma.part.create({
      data: {
        sku: parsed.data.sku.toUpperCase(),
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        reorderLevel: parsed.data.reorderLevel ?? 0,
        costCents: parsed.data.costCents ?? null,
        location: parsed.data.location ?? null,
        compatibleModels: {
          connect: parsed.data.modelIds.map((id) => ({ id })),
        },
      },
    });
    createdId = part.id;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/parts/new", errorMessage);

  void session;
  revalidatePath("/admin/parts");
  redirect(createdId ? `/admin/parts/${createdId}` : "/admin/parts");
}

// ---------------------------------------------------------------------------
// movementAction — receive / adjust / scrap / return
// ---------------------------------------------------------------------------

const movementSchema = z.object({
  partId: z.string().min(1),
  kind: z.nativeEnum(PartMovementKind),
  quantity: z.coerce.number().int(),
  reason: z.string().trim().max(500).optional(),
});

export async function applyPartMovementAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = movementSchema.safeParse({
    partId: formData.get("partId"),
    kind: formData.get("kind"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    const pid = formData.get("partId")?.toString() ?? "";
    flashError(
      pid ? `/admin/parts/${pid}` : "/admin/parts",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let errorMessage: string | null = null;
  try {
    await applyPartMovement({
      partId: parsed.data.partId,
      kind: parsed.data.kind,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Movement failed";
  }

  const back = `/admin/parts/${parsed.data.partId}`;
  if (errorMessage) flashError(back, errorMessage);

  revalidatePath("/admin/parts");
  revalidatePath(back);
  redirect(back);
}

// ---------------------------------------------------------------------------
// recordPartUsageAction — called from the ticket detail page
// ---------------------------------------------------------------------------

const usageSchema = z.object({
  ticketId: z.string().min(1),
  partId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(1000),
  reason: z.string().trim().max(500).optional(),
});

export async function recordPartUsageAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.TICKETS_WRITE);

  const parsed = usageSchema.safeParse({
    ticketId: formData.get("ticketId"),
    partId: formData.get("partId"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    const tid = formData.get("ticketId")?.toString() ?? "";
    flashError(
      `/tickets/${tid}`,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let errorMessage: string | null = null;
  try {
    await recordPartUsage({
      ticketId: parsed.data.ticketId,
      partId: parsed.data.partId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason ?? null,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Usage failed";
  }

  if (errorMessage) {
    flashError(`/tickets/${parsed.data.ticketId}`, errorMessage);
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/admin/parts");
  redirect(`/tickets/${parsed.data.ticketId}`);
}

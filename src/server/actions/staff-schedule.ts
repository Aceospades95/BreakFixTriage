"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, StaffScheduleKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSession, requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { blocksOverlap } from "@/lib/scheduling/people";

/**
 * Round-4 §N2 — StaffSchedule CRUD.
 *
 * RBAC matrix per the brief:
 *
 *   - ADMIN / OPS_MANAGER / DISPATCHER can write any user's
 *     schedule.
 *   - A user can write only their own PTO / OUT_OF_OFFICE /
 *     TRAINING (the self-serve `/me/schedule` flow).
 *   - WAREHOUSE / MEETING blocks are Ops-only.
 *
 * Every CRUD audits with field diff. Derived ON_ROUTE blocks are
 * NEVER persisted; the create action rejects `kind = ON_ROUTE`.
 *
 * Overlap detection is server-side via `blocksOverlap`. The DB
 * unique-on-(userId, date, startMinute) catches the exact-start
 * collision, but interval overlaps need the helper.
 */

const SELF_SERVE_KINDS: StaffScheduleKind[] = [
  StaffScheduleKind.PTO,
  StaffScheduleKind.OUT_OF_OFFICE,
  StaffScheduleKind.TRAINING,
];

const createSchema = z.object({
  userId: z.string().min(1),
  date: z.coerce.date(),
  startMinute: z.coerce.number().int().min(0).max(24 * 60),
  endMinute: z.coerce.number().int().min(1).max(24 * 60),
  kind: z.nativeEnum(StaffScheduleKind),
  note: z.string().trim().max(500).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export async function createScheduleBlockAction(formData: FormData) {
  const session = await requireSession();

  const parsed = createSchema.safeParse({
    userId: formData.get("userId"),
    date: formData.get("date"),
    startMinute: formData.get("startMinute"),
    endMinute: formData.get("endMinute"),
    kind: formData.get("kind"),
    note: formData.get("note")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/scheduling/people?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
    );
  }
  if (parsed.data.kind === StaffScheduleKind.ON_ROUTE) {
    redirect(
      `/scheduling/people?error=${encodeURIComponent(
        "ON_ROUTE blocks are derived from Route rows; create a Route instead.",
      )}`,
    );
  }
  if (parsed.data.endMinute <= parsed.data.startMinute) {
    redirect(
      `/scheduling/people?error=${encodeURIComponent("End must be after start.")}`,
    );
  }

  // RBAC: writing to another user requires SCHEDULING_WRITE +
  // ADMIN/OPS_MANAGER/DISPATCHER. Self-serve writes can only land
  // self-serve kinds.
  const isSelfServe = parsed.data.userId === session.userId;
  if (isSelfServe) {
    if (!SELF_SERVE_KINDS.includes(parsed.data.kind)) {
      redirect(
        `/me/schedule?error=${encodeURIComponent(
          "You can only schedule PTO, OOO, or training for yourself.",
        )}`,
      );
    }
  } else {
    // Cross-user write — require write permission. Caller route
    // sets permission expectations via SCHEDULING_WRITE.
    if (
      session.role !== "ADMIN" &&
      session.role !== "OPS_MANAGER" &&
      session.role !== "DISPATCHER"
    ) {
      redirect(
        `/scheduling/people?error=${encodeURIComponent("Forbidden: cannot edit another user's schedule.")}`,
      );
    }
  }

  // Overlap check — pull every block for the (user, date) and
  // refuse if any overlaps the proposed window.
  const start = startOfUtcDay(parsed.data.date);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const existing = await prisma.staffSchedule.findMany({
    where: {
      userId: parsed.data.userId,
      date: { gte: start, lt: end },
    },
  });
  for (const b of existing) {
    if (
      blocksOverlap(
        {
          userId: b.userId,
          date: b.date,
          startMinute: b.startMinute,
          endMinute: b.endMinute,
        },
        parsed.data,
      )
    ) {
      redirect(
        `/scheduling/people?error=${encodeURIComponent(
          `Overlaps an existing ${b.kind} block on the same day.`,
        )}`,
      );
    }
  }

  const created = await prisma.staffSchedule.create({
    data: {
      userId: parsed.data.userId,
      date: start,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      kind: parsed.data.kind,
      note: parsed.data.note ?? null,
      createdByUserId: session.userId,
    },
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "StaffSchedule",
    entityId: created.id,
    action: "staff.schedule.created",
    after: {
      userId: created.userId,
      date: created.date.toISOString().slice(0, 10),
      startMinute: created.startMinute,
      endMinute: created.endMinute,
      kind: created.kind,
      note: created.note,
    },
    reason: parsed.data.note,
  });

  revalidatePath("/scheduling/people");
  revalidatePath("/me/schedule");
  redirect(
    isSelfServe
      ? "/me/schedule?ok=Schedule+block+saved"
      : "/scheduling/people?ok=Schedule+block+saved",
  );
}

export async function deleteScheduleBlockAction(formData: FormData) {
  const session = await requireSession();
  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason")?.toString() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/scheduling/people?error=${encodeURIComponent("Invalid id")}`,
    );
  }
  const before = await prisma.staffSchedule.findUnique({
    where: { id: parsed.data.id },
  });
  if (!before) {
    redirect(`/scheduling/people?error=${encodeURIComponent("Not found")}`);
  }

  // RBAC: only the row's owner OR an Ops/Admin/Dispatcher can
  // delete. The owner can delete only self-serve kinds.
  const isSelfServe = before.userId === session.userId;
  if (isSelfServe) {
    if (!SELF_SERVE_KINDS.includes(before.kind)) {
      redirect(
        `/me/schedule?error=${encodeURIComponent(
          "You can't delete this kind of block. Ask Ops.",
        )}`,
      );
    }
  } else if (
    session.role !== "ADMIN" &&
    session.role !== "OPS_MANAGER" &&
    session.role !== "DISPATCHER"
  ) {
    redirect(
      `/scheduling/people?error=${encodeURIComponent(
        "Forbidden: cannot delete another user's schedule.",
      )}`,
    );
  }

  await prisma.staffSchedule.delete({ where: { id: before.id } });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "StaffSchedule",
    entityId: before.id,
    action: "staff.schedule.deleted",
    before: {
      userId: before.userId,
      date: before.date.toISOString().slice(0, 10),
      startMinute: before.startMinute,
      endMinute: before.endMinute,
      kind: before.kind,
      note: before.note,
    },
    reason: parsed.data.reason ?? null,
  });

  revalidatePath("/scheduling/people");
  revalidatePath("/me/schedule");
  redirect(
    isSelfServe
      ? "/me/schedule?ok=Block+deleted"
      : "/scheduling/people?ok=Block+deleted",
  );
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
  );
}

// Re-export the Prisma type for downstream callers — the page
// renders rows by this shape.
export type { StaffSchedule } from "@prisma/client";

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LoanerAssignmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";

function flashError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// createLoanerAction
// ---------------------------------------------------------------------------

const createLoanerSchema = z.object({
  serialNumber: z.string().trim().min(1).max(100),
  assetTag: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  modelName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Add a new loaner device to the pool. Loaners are distinct from
 * the regular Device table because they belong to the repair shop,
 * not to a school, and have a simpler lifecycle (active / retired).
 */
export async function createLoanerAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const parsed = createLoanerSchema.safeParse({
    serialNumber: formData.get("serialNumber"),
    assetTag: formData.get("assetTag")?.toString() || undefined,
    manufacturer: formData.get("manufacturer")?.toString() || undefined,
    modelName: formData.get("modelName")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError(
      "/admin/loaners/new",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  let createdId: string | null = null;
  let errorMessage: string | null = null;
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
        },
        update: {},
      });
      modelId = model.id;
    }
    const loaner = await prisma.loanerDevice.create({
      data: {
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        modelId: modelId ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    createdId = loaner.id;
    await writeAudit({
      actorUserId: session.userId,
      entityType: "LoanerDevice",
      entityId: loaner.id,
      action: "create",
      after: { serialNumber: loaner.serialNumber },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Create failed";
  }
  if (errorMessage) flashError("/admin/loaners/new", errorMessage);

  revalidatePath("/admin/loaners");
  redirect(createdId ? `/admin/loaners/${createdId}` : "/admin/loaners");
}

// ---------------------------------------------------------------------------
// checkOutLoanerAction
// ---------------------------------------------------------------------------

const checkOutSchema = z.object({
  loanerId: z.string().min(1),
  schoolId: z.string().min(1),
  ticketId: z.string().optional(),
  contactName: z.string().trim().max(200).optional(),
  dueBackAt: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Hand a loaner to a school. Refuses if the loaner already has an
 * ACTIVE assignment — each physical device can only be out with one
 * school at a time.
 */
export async function checkOutLoanerAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);

  const parsed = checkOutSchema.safeParse({
    loanerId: formData.get("loanerId"),
    schoolId: formData.get("schoolId"),
    ticketId: formData.get("ticketId")?.toString() || undefined,
    contactName: formData.get("contactName")?.toString() || undefined,
    dueBackAt: formData.get("dueBackAt")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    const lid = formData.get("loanerId")?.toString() ?? "";
    flashError(
      lid ? `/admin/loaners/${lid}` : "/admin/loaners",
      "Invalid checkout",
    );
  }

  let errorMessage: string | null = null;
  try {
    const loaner = await prisma.loanerDevice.findUnique({
      where: { id: parsed.data.loanerId },
      include: {
        assignments: {
          where: { status: LoanerAssignmentStatus.ACTIVE },
          take: 1,
        },
      },
    });
    if (!loaner) {
      errorMessage = "Loaner not found";
    } else if (!loaner.active) {
      errorMessage = "Loaner is retired";
    } else if (loaner.assignments.length > 0) {
      errorMessage = "Loaner is already checked out";
    } else {
      const assignment = await prisma.loanerAssignment.create({
        data: {
          loanerId: parsed.data.loanerId,
          schoolId: parsed.data.schoolId,
          ticketId: parsed.data.ticketId ?? null,
          contactName: parsed.data.contactName ?? null,
          dueBackAt: parsed.data.dueBackAt
            ? new Date(parsed.data.dueBackAt)
            : null,
          notes: parsed.data.notes ?? null,
          checkedOutByUserId: session.userId,
        },
      });
      await writeAudit({
        actorUserId: session.userId,
        entityType: "LoanerAssignment",
        entityId: assignment.id,
        action: "check-out",
        after: {
          loanerId: parsed.data.loanerId,
          schoolId: parsed.data.schoolId,
          ticketId: parsed.data.ticketId ?? null,
        },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Check-out failed";
  }

  const back = `/admin/loaners/${parsed.data.loanerId}`;
  if (errorMessage) flashError(back, errorMessage);

  revalidatePath("/admin/loaners");
  revalidatePath(back);
  if (parsed.data.ticketId) {
    revalidatePath(`/tickets/${parsed.data.ticketId}`);
  }
  redirect(back);
}

// ---------------------------------------------------------------------------
// returnLoanerAction
// ---------------------------------------------------------------------------

const returnSchema = z.object({
  assignmentId: z.string().min(1),
  status: z
    .enum([LoanerAssignmentStatus.RETURNED, LoanerAssignmentStatus.LOST])
    .default(LoanerAssignmentStatus.RETURNED),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Return a loaner to the shop or mark it lost. Either way, the
 * assignment transitions out of ACTIVE so the physical device is
 * available for a new checkout.
 */
export async function returnLoanerAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);

  const parsed = returnSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    status: formData.get("status") || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  });
  if (!parsed.success) {
    flashError("/admin/loaners", "Invalid return request");
  }

  let errorMessage: string | null = null;
  let loanerId: string | null = null;
  try {
    const assignment = await prisma.loanerAssignment.findUnique({
      where: { id: parsed.data.assignmentId },
    });
    if (!assignment) {
      errorMessage = "Assignment not found";
    } else if (assignment.status !== LoanerAssignmentStatus.ACTIVE) {
      errorMessage = `Assignment is already ${assignment.status}`;
    } else {
      loanerId = assignment.loanerId;
      await prisma.loanerAssignment.update({
        where: { id: assignment.id },
        data: {
          status: parsed.data.status,
          returnedAt: new Date(),
          notes: parsed.data.notes ?? assignment.notes,
        },
      });
      await writeAudit({
        actorUserId: session.userId,
        entityType: "LoanerAssignment",
        entityId: assignment.id,
        action: parsed.data.status === "LOST" ? "mark-lost" : "return",
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Return failed";
  }

  const back = loanerId ? `/admin/loaners/${loanerId}` : "/admin/loaners";
  if (errorMessage) flashError(back, errorMessage);

  revalidatePath("/admin/loaners");
  revalidatePath(back);
  redirect(back);
}

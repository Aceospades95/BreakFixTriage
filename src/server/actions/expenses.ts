"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ExpenseKind, ExpenseStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, requireSession } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { withFeedback } from "@/lib/url";

/**
 * Round-20 — NY team: "Ability for tech to submit bus fare receipts
 * and generate an expense report based on the tickets/locations
 * serviced."
 *
 * Techs submit from /me/expenses (receipt photo attaches via the
 * EXPENSE attachment kind); ops review on /admin/expenses; the
 * weekly finance report compiles approved+submitted totals per tech
 * with the locations serviced that week.
 */

function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_00) return null;
  return cents;
}

const submitSchema = z.object({
  kind: z.nativeEnum(ExpenseKind),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  description: z.string().trim().max(500).optional(),
  routeId: z.string().optional(),
});

export async function submitExpenseAction(formData: FormData) {
  const session = await requireSession();

  const amountCents = parseAmountCents(
    formData.get("amount")?.toString() ?? "",
  );
  const parsed = submitSchema.safeParse({
    kind: formData.get("kind"),
    incurredOn: formData.get("incurredOn"),
    description: formData.get("description")?.toString().trim() || undefined,
    routeId: formData.get("routeId")?.toString() || undefined,
  });
  if (!parsed.success || amountCents == null) {
    redirect(
      withFeedback(
        "/me/expenses",
        "error",
        amountCents == null
          ? "Enter a valid amount, e.g. 2.90"
          : parsed.success
            ? "Invalid expense"
            : parsed.error.issues.map((i) => i.message).join("; "),
      ),
    );
  }

  // Optional route link: only the tech's own routes are accepted so
  // an expense can't be pinned to someone else's run.
  let routeId: string | null = null;
  let schoolId: string | null = null;
  if (parsed.data.routeId) {
    const route = await prisma.route.findFirst({
      where: { id: parsed.data.routeId, assigneeUserId: session.userId },
      include: {
        stops: {
          take: 1,
          orderBy: { sequence: "asc" },
          select: { job: { select: { schoolId: true } } },
        },
      },
    });
    if (route) {
      routeId = route.id;
      schoolId = route.stops[0]?.job.schoolId ?? null;
    }
  }

  const expense = await prisma.expense.create({
    data: {
      techUserId: session.userId,
      kind: parsed.data.kind,
      amountCents,
      incurredOn: new Date(`${parsed.data.incurredOn}T00:00:00.000Z`),
      description: parsed.data.description ?? null,
      routeId,
      schoolId,
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "Expense",
    entityId: expense.id,
    action: "expense.submitted",
    after: {
      kind: parsed.data.kind,
      amountCents,
      incurredOn: parsed.data.incurredOn,
      routeId,
    },
  });

  revalidatePath("/me/expenses");
  revalidatePath("/admin/expenses");
  redirect(
    withFeedback(
      "/me/expenses",
      "ok",
      "Expense submitted — attach the receipt photo below so review goes through in one pass.",
    ),
  );
}

export async function deleteOwnExpenseAction(formData: FormData) {
  const session = await requireSession();
  const expenseId = formData.get("expenseId")?.toString();
  if (!expenseId) redirect("/me/expenses");

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });
  // Only the submitter can withdraw, and only before review.
  if (
    !expense ||
    expense.techUserId !== session.userId ||
    expense.status !== ExpenseStatus.SUBMITTED
  ) {
    redirect(
      withFeedback(
        "/me/expenses",
        "error",
        "Only your own un-reviewed expenses can be withdrawn.",
      ),
    );
  }
  await prisma.expense.delete({ where: { id: expenseId } });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "Expense",
    entityId: expenseId,
    action: "expense.withdrawn",
    before: { amountCents: expense.amountCents, kind: expense.kind },
  });

  revalidatePath("/me/expenses");
  revalidatePath("/admin/expenses");
  redirect(withFeedback("/me/expenses", "ok", "Expense withdrawn."));
}

const reviewSchema = z.object({
  expenseId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export async function reviewExpenseAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EXPENSES_REVIEW);
  const parsed = reviewSchema.safeParse({
    expenseId: formData.get("expenseId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    redirect(withFeedback("/admin/expenses", "error", "Invalid review"));
  }

  const expense = await prisma.expense.findUnique({
    where: { id: parsed.data.expenseId },
  });
  if (!expense) {
    redirect(withFeedback("/admin/expenses", "error", "Expense not found"));
  }
  await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: parsed.data.decision as ExpenseStatus,
      reviewedByUserId: session.userId,
      reviewedAt: new Date(),
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "Expense",
    entityId: expense.id,
    action: `expense.${parsed.data.decision.toLowerCase()}`,
    after: { amountCents: expense.amountCents, techUserId: expense.techUserId },
  });

  revalidatePath("/admin/expenses");
  revalidatePath("/me/expenses");
  redirect(
    withFeedback(
      "/admin/expenses",
      "ok",
      parsed.data.decision === "APPROVED" ? "Expense approved." : "Expense rejected.",
    ),
  );
}

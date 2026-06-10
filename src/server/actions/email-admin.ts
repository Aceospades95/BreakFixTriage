"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EmailEvent, EmailRuleScope, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { TEMPLATE_SEEDS } from "@/lib/email/template-seed-data";

/**
 * Round-5 §3.3 — admin seed actions for email templates and rules.
 *
 * The /admin/email-templates and /admin/email-rules pages used to
 * render literal CLI commands ("Run npx prisma db push +
 * npm run email:seed-templates"). Round-5 replaces those with
 * "Seed default templates" / "Seed default rules" buttons that
 * call these actions and surface a toast on success.
 *
 * Both actions are idempotent: existing rows are upserted (the
 * Round-2 contract). They write audit rows tagged
 * `entityType=EmailTemplate|EmailRule, action=seed` so the audit
 * log shows the operator who clicked the button.
 */

export async function seedDefaultTemplatesAction(): Promise<void> {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);

  let upserted = 0;
  for (const seed of TEMPLATE_SEEDS) {
    await prisma.emailTemplate.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        subject: seed.subject,
        bodyHtml: seed.bodyHtml,
        bodyText: seed.bodyText,
        variables: seed.variables as unknown as Prisma.InputJsonValue,
      },
      update: {
        subject: seed.subject,
        bodyHtml: seed.bodyHtml,
        bodyText: seed.bodyText,
        variables: seed.variables as unknown as Prisma.InputJsonValue,
      },
    });
    upserted++;
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailTemplate",
    entityId: "seed-default-templates",
    action: "seed",
    after: { upserted, keys: TEMPLATE_SEEDS.map((s) => s.key) },
    reason: "Default templates seeded via admin UI",
  });

  revalidatePath("/admin/email-templates");
  redirect(
    `/admin/email-templates?ok=${encodeURIComponent(
      `Seeded ${upserted} default template${upserted === 1 ? "" : "s"}`,
    )}`,
  );
}

/**
 * Seed an example rule covering the `ticket_created` event so a
 * fresh DB has at least one rule firing. The recipients use the
 * documented kinds:
 *   - SPOC contacts at the affected school (those with
 *     receivesTicketEmails === true)
 *   - the ticket reporter (from ticket.meta.requesterEmail)
 *   - the global Wynndalco team list (Settings.wynndalcoTeamEmails)
 *
 * If a rule already exists for the same (scope=GLOBAL,
 * event=ticket_created, templateKey=ticket_created), this action
 * is a no-op and writes a `seed:noop` audit row so the operator
 * sees a clear "already seeded" message instead of a silent
 * success.
 */
export async function seedExampleRuleAction(): Promise<void> {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);

  const template = await prisma.emailTemplate.findUnique({
    where: { key: "ticket_created" },
  });
  if (!template) {
    redirect(
      `/admin/email-rules?error=${encodeURIComponent(
        "Seed default templates first — the ticket_created template doesn't exist yet.",
      )}`,
    );
  }

  // Check for an existing matching rule.
  const existing = await prisma.emailRule.findFirst({
    where: {
      scope: EmailRuleScope.GLOBAL,
      event: EmailEvent.ticket_created,
      templateId: template.id,
    },
  });
  if (existing) {
    await writeAudit({
      actorUserId: session.userId,
      entityType: "EmailRule",
      entityId: existing.id,
      action: "seed:noop",
      reason: "Example rule already exists; no changes made.",
    });
    redirect(
      `/admin/email-rules?ok=${encodeURIComponent(
        "Example rule already exists — nothing changed.",
      )}`,
    );
  }

  const created = await prisma.emailRule.create({
    data: {
      scope: EmailRuleScope.GLOBAL,
      scopeId: null,
      event: EmailEvent.ticket_created,
      templateId: template.id,
      enabled: true,
      recipients: {
        to: [{ kind: "school_spoc" }, { kind: "ticket_reporter" }],
        cc: [{ kind: "wynndalco_team" }],
        bcc: [],
      } as unknown as Prisma.InputJsonValue,
      createdByUserId: session.userId,
    },
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: created.id,
    action: "seed",
    after: {
      scope: created.scope,
      event: created.event,
      templateKey: template.key,
    },
    reason: "Example rule seeded via admin UI",
  });

  revalidatePath("/admin/email-rules");
  redirect(
    `/admin/email-rules?ok=${encodeURIComponent(
      "Seeded example rule for new tickets.",
    )}`,
  );
}

/**
 * Round-16 (D4) — re-enqueue a dead-lettered EmailJob from
 * /admin/exceptions. Resets the attempt counter and backoff so the
 * worker picks it up on its next pass; the linked EmailLog row (if
 * any) returns to `queued` so the operator-facing log reflects the
 * retry. EMAIL_WRITE-gated like the rest of the email admin
 * surface; every requeue writes an audit row.
 */
export async function requeueDeadLetteredEmailJobAction(
  formData: FormData,
) {
  const session = await requireRole(PERMISSIONS.EMAIL_WRITE);
  const jobId = formData.get("jobId")?.toString();
  if (!jobId) {
    redirect("/admin/exceptions?error=Missing+job+id");
  }

  const job = await prisma.emailJob.findUnique({ where: { id: jobId } });
  if (!job) {
    redirect("/admin/exceptions?error=Job+not+found");
  }
  if (job.status !== "failed") {
    redirect(
      `/admin/exceptions?error=${encodeURIComponent(
        "Only dead-lettered jobs can be requeued.",
      )}`,
    );
  }

  await prisma.emailJob.update({
    where: { id: job.id },
    data: {
      status: "pending",
      attempts: 0,
      nextRunAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
  if (job.emailLogId) {
    await prisma.emailLog.updateMany({
      where: { id: job.emailLogId, status: "failed" },
      data: { status: "queued", error: null },
    });
  }

  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailJob",
    entityId: job.id,
    action: "email.job.requeued",
    before: { status: "failed", attempts: job.attempts },
    after: { status: "pending", attempts: 0 },
    reason: job.lastError ?? undefined,
  });

  revalidatePath("/admin/exceptions");
  redirect("/admin/exceptions?ok=Job+requeued");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EmailEvent, EmailRuleScope, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit/audit";
import { withFeedback } from "@/lib/url";
import {
  isRecipientSet,
  RECIPIENT_KINDS,
  type Recipient,
  type RecipientKind,
} from "@/lib/email/recipients";

/**
 * Round-22 — email-rule editor actions.
 *
 * The /admin/email-rules page was read-only: one hardcoded "seed
 * example" button and a static table. These actions let admins
 * actually build the rules out — add a rule per event, toggle it,
 * edit its recipients (any kind across to/cc/bcc), swap its
 * template, and delete it. EMAIL_RULES_MANAGE-gated (admin), every
 * mutation audited.
 */

const RULES_PATH = "/admin/email-rules";

/**
 * Parse the recipients editor payload. The client component
 * serializes the to/cc/bcc buckets into a single `recipientsJson`
 * hidden field; we validate it through the same isRecipientSet
 * gate the resolver trusts.
 */
function parseRecipients(raw: string | null): {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
} | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // Drop literal lines with no address and normalise kinds.
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const clean = (bucket: unknown): Recipient[] => {
    if (!Array.isArray(bucket)) return [];
    const out: Recipient[] = [];
    for (const item of bucket) {
      if (!item || typeof item !== "object") continue;
      const kind = (item as Record<string, unknown>).kind;
      const value = (item as Record<string, unknown>).value;
      if (typeof kind !== "string" || !RECIPIENT_KINDS.includes(kind as RecipientKind)) {
        continue;
      }
      if (kind === "literal") {
        const v = typeof value === "string" ? value.trim() : "";
        if (!v.includes("@")) continue;
        out.push({ kind, value: v });
      } else {
        out.push({ kind: kind as RecipientKind });
      }
    }
    return out;
  };
  const set = {
    to: clean(obj.to),
    cc: clean(obj.cc),
    bcc: clean(obj.bcc),
  };
  return isRecipientSet(set) ? set : null;
}

/**
 * Add a GLOBAL rule for an event. Defaults the template to the one
 * whose key matches the event (every seeded event has one).
 */
export async function createEmailRuleAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);
  const eventRaw = formData.get("event")?.toString() ?? "";
  const event = (Object.values(EmailEvent) as string[]).includes(eventRaw)
    ? (eventRaw as EmailEvent)
    : null;
  if (!event) {
    redirect(withFeedback(RULES_PATH, "error", "Pick a valid event."));
  }

  const templateId = formData.get("templateId")?.toString() || null;
  const template = templateId
    ? await prisma.emailTemplate.findUnique({ where: { id: templateId } })
    : await prisma.emailTemplate.findFirst({ where: { key: event } });
  if (!template) {
    redirect(
      withFeedback(
        RULES_PATH,
        "error",
        "No template found for that event — seed default templates first.",
      ),
    );
  }

  const created = await prisma.emailRule.create({
    data: {
      scope: EmailRuleScope.GLOBAL,
      scopeId: null,
      event,
      templateId: template.id,
      // New rules start disabled — the operator wires recipients
      // then flips it on. Never auto-emails on create.
      enabled: false,
      recipients: { to: [], cc: [], bcc: [] } as unknown as Prisma.InputJsonValue,
      createdByUserId: session.userId,
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: created.id,
    action: "rule.created",
    after: { event, templateKey: template.key },
  });

  revalidatePath(RULES_PATH);
  redirect(
    withFeedback(
      RULES_PATH,
      "ok",
      "Rule added (disabled). Add recipients, then enable it.",
    ),
  );
}

export async function toggleEmailRuleAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);
  const ruleId = formData.get("ruleId")?.toString();
  if (!ruleId) redirect(withFeedback(RULES_PATH, "error", "Missing rule id."));

  const rule = await prisma.emailRule.findUnique({
    where: { id: ruleId },
    include: { template: { select: { key: true } } },
  });
  if (!rule) redirect(withFeedback(RULES_PATH, "error", "Rule not found."));

  // Guard: enabling a rule with no resolvable `to` recipients would
  // just dead-letter every send. Block it with a clear message.
  if (!rule.enabled) {
    const set = rule.recipients as { to?: unknown[] } | null;
    if (!set || !Array.isArray(set.to) || set.to.length === 0) {
      redirect(
        withFeedback(
          RULES_PATH,
          "error",
          "Add at least one 'To' recipient before enabling this rule.",
        ),
      );
    }
  }

  await prisma.emailRule.update({
    where: { id: ruleId },
    data: { enabled: !rule.enabled },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: ruleId,
    action: rule.enabled ? "rule.disabled" : "rule.enabled",
    after: { event: rule.event, templateKey: rule.template.key },
  });

  revalidatePath(RULES_PATH);
  redirect(
    withFeedback(
      RULES_PATH,
      "ok",
      rule.enabled
        ? "Rule disabled — it will stop sending."
        : "Rule enabled — it will send on the next matching event.",
    ),
  );
}

export async function updateEmailRuleRecipientsAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);
  const ruleId = formData.get("ruleId")?.toString();
  if (!ruleId) redirect(withFeedback(RULES_PATH, "error", "Missing rule id."));

  const recipients = parseRecipients(
    formData.get("recipientsJson")?.toString() ?? null,
  );
  if (!recipients) {
    redirect(
      withFeedback(
        RULES_PATH,
        "error",
        "Couldn't read the recipients — remove any blank address rows and try again.",
      ),
    );
  }

  const rule = await prisma.emailRule.findUnique({ where: { id: ruleId } });
  if (!rule) redirect(withFeedback(RULES_PATH, "error", "Rule not found."));

  // If the edit empties the `to` bucket, force the rule off so it
  // can't silently dead-letter.
  const willBeEmpty = recipients.to.length === 0;
  await prisma.emailRule.update({
    where: { id: ruleId },
    data: {
      recipients: JSON.parse(
        JSON.stringify(recipients),
      ) as Prisma.InputJsonValue,
      ...(willBeEmpty && rule.enabled ? { enabled: false } : {}),
    },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: ruleId,
    action: "rule.recipients_updated",
    after: JSON.parse(JSON.stringify({ recipients })) as Prisma.InputJsonObject,
  });

  revalidatePath(RULES_PATH);
  redirect(
    withFeedback(
      RULES_PATH,
      "ok",
      willBeEmpty
        ? "Recipients saved — rule disabled because it has no 'To' addresses."
        : "Recipients saved.",
    ),
  );
}

export async function updateEmailRuleTemplateAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);
  const ruleId = formData.get("ruleId")?.toString();
  const templateId = formData.get("templateId")?.toString();
  if (!ruleId || !templateId) {
    redirect(withFeedback(RULES_PATH, "error", "Missing rule or template."));
  }
  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) redirect(withFeedback(RULES_PATH, "error", "Template not found."));

  await prisma.emailRule.update({
    where: { id: ruleId },
    data: { templateId },
  });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: ruleId,
    action: "rule.template_updated",
    after: { templateKey: template.key },
  });

  revalidatePath(RULES_PATH);
  redirect(withFeedback(RULES_PATH, "ok", `Template set to ${template.key}.`));
}

export async function deleteEmailRuleAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.EMAIL_RULES_MANAGE);
  const ruleId = formData.get("ruleId")?.toString();
  if (!ruleId) redirect(withFeedback(RULES_PATH, "error", "Missing rule id."));

  const rule = await prisma.emailRule.findUnique({
    where: { id: ruleId },
    include: { template: { select: { key: true } } },
  });
  if (!rule) redirect(withFeedback(RULES_PATH, "error", "Rule not found."));

  await prisma.emailRule.delete({ where: { id: ruleId } });
  await writeAudit({
    actorUserId: session.userId,
    entityType: "EmailRule",
    entityId: ruleId,
    action: "rule.deleted",
    before: { event: rule.event, templateKey: rule.template.key },
  });

  revalidatePath(RULES_PATH);
  redirect(withFeedback(RULES_PATH, "ok", "Rule deleted."));
}

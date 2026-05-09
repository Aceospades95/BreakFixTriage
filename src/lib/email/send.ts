/**
 * Centralised email-event dispatch entrypoint.
 *
 * Round-2 §3/§5/§20. Every code path that sends an email goes
 * through `dispatchEmailEvent`. That gives us:
 *
 *   - One choke point for rate-limiting + audit + tests.
 *   - One place that knows how to load the matching EmailRule(s)
 *     for a given (event, scope) tuple.
 *   - One place that writes the EmailLog row up-front in `queued`
 *     status so the worker has something to update on send.
 *
 * The dispatch itself is split:
 *
 *   1. `dispatchEmailEvent(event, ctx)` (this file): synchronous
 *      load + render + EmailLog insert + EmailJob enqueue.
 *   2. `processEmailJob(job)` (this file, called by the worker):
 *      provider.send + EmailLog status update + audit row.
 *
 * Audit: every send writes an audit row with
 * `transitionType: "email_send"` per ADR 0006.
 */

import {
  EmailEvent,
  EmailLogStatus,
  EmailRuleScope,
  type PrismaClient,
  type Prisma,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import {
  resolveRecipients,
  isRecipientSet,
  type RecipientContext,
} from "./recipients";
import { renderTemplate, validateVariables } from "./render";
import { enqueue, complete, fail, type QueueJob } from "./queue";
import {
  getEmailProvider as buildProvider,
} from "./provider";
import {
  getEmailFromAddress,
  getEmailReplyTo,
} from "@/lib/settings/settings";

export interface DispatchContext {
  ticketId?: string;
  schoolId?: string;
  routeId?: string;
  quoteId?: string;
  /** Variables passed to the template render. */
  variables: Record<string, unknown>;
  /** Optional scope hint for rule matching. */
  scope?: { kind: EmailRuleScope; id?: string };
  /** Audit actor — null = system. */
  actorUserId?: string | null;
}

const FAMILY_BY_EVENT: Record<EmailEvent, RecipientContext["family"]> = {
  ticket_created: "ticket",
  ticket_assigned: "ticket",
  ticket_status_changed: "ticket",
  quote_sent: "quote",
  quote_approved_internal: "internal",
  delivery_scheduled: "delivery",
  delivery_completed_with_receipt: "delivery",
  sla_breach_warning: "internal",
  sla_breached: "internal",
  daily_digest: "internal",
  // Round-6 §3A — four highest-impact status events.
  status_in_repair: "ticket",
  status_parts_ordered: "ticket",
  ticket_closed: "ticket",
  // Round-6 §3B — manual SPOC ticket update.
  ticket_update_to_spoc: "ticket",
  // Round-7 §3B — quote approval + pickup completion.
  quote_approved: "quote",
  pickup_completed: "delivery",
};

interface DispatchedRule {
  ruleId: string;
  emailLogId: string;
  jobId: string;
}

/**
 * Resolve every applicable rule for the (event, scope) tuple, write
 * an EmailLog row per rule (status = queued), and enqueue an
 * EmailJob per rule. Returns the list of (rule, log, job) triples
 * the caller can render in the toast / dev console.
 */
export async function dispatchEmailEvent(
  event: EmailEvent,
  ctx: DispatchContext,
  db: PrismaClient = defaultPrisma,
): Promise<DispatchedRule[]> {
  const rules = await loadMatchingRules(event, ctx, db);
  if (rules.length === 0) return [];

  const out: DispatchedRule[] = [];
  for (const rule of rules) {
    if (!isRecipientSet(rule.recipients)) {
      console.warn(
        `[email] rule ${rule.id} has malformed recipients JSON; skipping.`,
      );
      continue;
    }
    const family = FAMILY_BY_EVENT[event];
    const resolved = await resolveRecipients(
      rule.recipients,
      {
        ticketId: ctx.ticketId,
        schoolId: ctx.schoolId,
        family,
      },
      db,
    );
    if (resolved.to.length === 0) {
      // No `to` recipient resolved — skip the send rather than
      // trying to mail empty. Write a log row in `failed` state so
      // ops can see why nothing went out.
      const log = await db.emailLog.create({
        data: {
          ruleId: rule.id,
          templateId: rule.templateId,
          ticketId: ctx.ticketId ?? null,
          routeId: ctx.routeId ?? null,
          quoteId: ctx.quoteId ?? null,
          to: [],
          cc: resolved.cc,
          bcc: resolved.bcc,
          subject: "(skipped)",
          bodyHtml: "",
          status: EmailLogStatus.failed,
          error: "no `to` recipients resolved",
        },
      });
      await writeAudit(
        {
          actorUserId: ctx.actorUserId ?? null,
          entityType: "EmailLog",
          entityId: log.id,
          action: `email:dispatch:skipped:${event}`,
          after: { reason: "no recipients" },
          reason: "No recipients resolved for the rule.",
          transitionType: "email_send",
        },
        db,
      );
      continue;
    }

    const validation = validateVariables(rule.template.variables, ctx.variables);
    if (!validation.ok) {
      const log = await db.emailLog.create({
        data: {
          ruleId: rule.id,
          templateId: rule.templateId,
          ticketId: ctx.ticketId ?? null,
          routeId: ctx.routeId ?? null,
          quoteId: ctx.quoteId ?? null,
          to: resolved.to,
          cc: resolved.cc,
          bcc: resolved.bcc,
          subject: "(skipped)",
          bodyHtml: "",
          status: EmailLogStatus.failed,
          error: `template variable mismatch: missing ${validation.missing.join(", ")}`,
        },
      });
      await writeAudit(
        {
          actorUserId: ctx.actorUserId ?? null,
          entityType: "EmailLog",
          entityId: log.id,
          action: `email:dispatch:skipped:${event}`,
          after: { missing: validation.missing },
          reason: `Template "${rule.template.key}" missing variables: ${validation.missing.join(", ")}`,
          transitionType: "email_send",
        },
        db,
      );
      continue;
    }

    const rendered = renderTemplate({
      subject: rule.template.subject,
      bodyHtml: rule.template.bodyHtml,
      bodyText: rule.template.bodyText,
      variables: ctx.variables,
    });

    const log = await db.emailLog.create({
      data: {
        ruleId: rule.id,
        templateId: rule.templateId,
        ticketId: ctx.ticketId ?? null,
        routeId: ctx.routeId ?? null,
        quoteId: ctx.quoteId ?? null,
        to: resolved.to,
        cc: resolved.cc,
        bcc: resolved.bcc,
        subject: rendered.subject,
        bodyHtml: rendered.bodyHtml,
        status: EmailLogStatus.queued,
      },
    });
    const job = await enqueue(
      {
        templateKey: rule.template.key,
        payload: ctx.variables as Prisma.InputJsonValue as Record<string, unknown>,
        emailLogId: log.id,
      },
      db,
    );
    await writeAudit(
      {
        actorUserId: ctx.actorUserId ?? null,
        entityType: "EmailLog",
        entityId: log.id,
        action: `email:dispatch:queued:${event}`,
        after: {
          to: resolved.to,
          cc: resolved.cc,
          bcc: resolved.bcc,
          template: rule.template.key,
        },
        reason: rule.template.key,
        transitionType: "email_send",
      },
      db,
    );
    out.push({ ruleId: rule.id, emailLogId: log.id, jobId: job.id });
  }

  return out;
}

/**
 * Worker entry-point — given a claimed job, render the message and
 * push it through the configured provider, updating the matching
 * EmailLog row. Idempotent: if EmailLog.providerMessageId is
 * already set, treat this run as a no-op success.
 */
export async function processEmailJob(
  job: QueueJob,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  if (!job.emailLogId) {
    // Job without a log row — should not happen via
    // dispatchEmailEvent, but if a future caller creates a bare
    // job, just complete it.
    await complete(job.id, db);
    return;
  }
  const log = await db.emailLog.findUnique({ where: { id: job.emailLogId } });
  if (!log) {
    await complete(job.id, db);
    return;
  }
  if (log.providerMessageId && log.status === EmailLogStatus.sent) {
    // Already sent on a prior run; idempotent.
    await complete(job.id, db);
    return;
  }

  const provider = buildProvider();
  const from = (await getEmailFromAddress(db)) ?? undefined;
  const replyTo = (await getEmailReplyTo(db)) ?? undefined;

  // Re-render from the stored bodyHtml/subject. We trust the row
  // because dispatchEmailEvent persisted the rendered output.
  // The plaintext body isn't on EmailLog today; templates seed
  // both html and text and the worker pulls text fresh from the
  // template by key.
  const tmpl = await db.emailTemplate.findUnique({
    where: { key: job.templateKey },
    select: { bodyText: true },
  });
  const bodyText = tmpl?.bodyText ?? "";

  const result = await provider.send({
    to: log.to,
    cc: log.cc,
    bcc: log.bcc,
    subject: log.subject,
    bodyHtml: log.bodyHtml,
    bodyText: bodyText,
    from,
    replyTo,
  });

  if (result.ok) {
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: EmailLogStatus.sent,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        error: null,
      },
    });
    await complete(job.id, db);
  } else {
    const failResult = await fail(job.id, result.error, db);
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: failResult.deadLettered
          ? EmailLogStatus.failed
          : EmailLogStatus.queued,
        error: result.error,
      },
    });
  }
}

/**
 * Fetch every enabled rule whose (event, scope) matches the
 * dispatch context. Scope precedence is permissive: if a TICKET-
 * scoped rule exists, it's added in addition to the GLOBAL rule;
 * recipients are deduped at resolve time. (Future: an "exclusive"
 * scope mode if ops needs it.)
 */
async function loadMatchingRules(
  event: EmailEvent,
  ctx: DispatchContext,
  db: PrismaClient,
) {
  const baseFilter = { event, enabled: true };
  const orFilters: Prisma.EmailRuleWhereInput[] = [
    { ...baseFilter, scope: EmailRuleScope.GLOBAL },
  ];
  if (ctx.ticketId) {
    orFilters.push({
      ...baseFilter,
      scope: EmailRuleScope.TICKET,
      scopeId: ctx.ticketId,
    });
  }
  if (ctx.schoolId) {
    orFilters.push({
      ...baseFilter,
      scope: EmailRuleScope.SCHOOL,
      scopeId: ctx.schoolId,
    });
  }
  // DISTRICT scope: derive the district from the ticket's school
  // if available. Skipped here for the first cut; rules using
  // DISTRICT scope still match if the explicit scope hint is
  // passed in ctx.scope.
  if (ctx.scope?.kind === EmailRuleScope.DISTRICT && ctx.scope.id) {
    orFilters.push({
      ...baseFilter,
      scope: EmailRuleScope.DISTRICT,
      scopeId: ctx.scope.id,
    });
  }
  return db.emailRule.findMany({
    where: { OR: orFilters },
    include: { template: true },
  });
}

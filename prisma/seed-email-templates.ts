/**
 * Pre-seed email-template rows.
 *
 * Round-2 §4. Lives in prisma/ rather than src/lib/email so the
 * Docker runner image (which only ships prisma/) can run it. Each
 * entry is keyed on the EmailEvent enum value (or a freeform key)
 * and ships with a tiny default subject + html + text body so a
 * fresh DB has something rendering.
 *
 * Run locally:
 *   npm run email:seed-templates
 *
 * Run in production after `prisma db push` for the email schema:
 *   npx tsx prisma/seed-email-templates.ts
 *
 * Idempotent: existing rows are upserted (admins editing via
 * /admin/email-templates should treat re-running as a "reset to
 * defaults"). To preserve admin edits, the upsert can be loosened
 * to insert-only — out of scope for this branch; tracked in
 * proposed-issues.
 *
 * Self-contained by design (no `src/` imports). To add a new
 * template:
 *   1. Append a TemplateSeed entry below.
 *   2. Add the matching EmailEvent enum value to schema.prisma.
 *   3. Wire `dispatchEmailEvent` at the trigger site.
 *   4. Re-run this script.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TemplateSeed {
  key: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: {
    type: "object";
    required: string[];
    properties: Record<string, unknown>;
  };
}

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: "ticket_created",
    subject: "Ticket {{ticket.number}} created — {{ticket.summary}}",
    bodyHtml:
      "<p>Hi {{reporter.name}},</p>" +
      "<p>Your support ticket <strong>{{ticket.number}}</strong> for {{ticket.school}} has been created.</p>" +
      "<p>Summary: {{ticket.summary}}<br>Priority: {{ticket.priority}}</p>" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "Hi {{reporter.name}},\n\n" +
      "Your support ticket {{ticket.number}} for {{ticket.school}} has been created.\n" +
      "Summary: {{ticket.summary}}\nPriority: {{ticket.priority}}\n\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "reporter", "link"],
      properties: {
        ticket: { type: "object" },
        reporter: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "ticket_assigned",
    subject: "Ticket {{ticket.number}} assigned to {{assignee.name}}",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) was assigned to <strong>{{assignee.name}}</strong>.</p>" +
      "<p>{{ticket.summary}}</p>" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) was assigned to {{assignee.name}}.\n\n" +
      "{{ticket.summary}}\n\nView: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "assignee", "link"],
      properties: {
        ticket: { type: "object" },
        assignee: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "ticket_status_changed",
    subject: "Ticket {{ticket.number}} is now {{status.label}}",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) moved to <strong>{{status.label}}</strong>.</p>" +
      "{{# reason }}<p>Reason: {{reason}}</p>{{/ reason }}" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) moved to {{status.label}}.\n" +
      "{{# reason }}Reason: {{reason}}\n{{/ reason }}\nView: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "status", "link"],
      properties: {
        ticket: { type: "object" },
        status: { type: "object" },
        reason: { type: "string" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "quote_sent",
    subject: "Quote for ticket {{ticket.number}} — {{ticket.school}}",
    bodyHtml:
      "<p>Hi {{recipient.name}},</p>" +
      "<p>Please find the quote for ticket <strong>{{ticket.number}}</strong> attached.</p>" +
      "<p>Amount: {{quote.amount}}<br>Hold-window: {{quote.holdUntil}}</p>" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "Hi {{recipient.name}},\n\n" +
      "Please find the quote for ticket {{ticket.number}} attached.\n" +
      "Amount: {{quote.amount}}\nHold-window: {{quote.holdUntil}}\n\nView: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "quote", "link"],
      properties: {
        ticket: { type: "object" },
        quote: { type: "object" },
        recipient: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "quote_approved_internal",
    subject: "[INTERNAL] Quote approved for {{ticket.number}} ({{ticket.school}})",
    bodyHtml:
      "<p>The school approved the quote for <strong>{{ticket.number}}</strong>.</p>" +
      "<p>Amount: {{quote.amount}}</p>" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "The school approved the quote for {{ticket.number}}.\n" +
      "Amount: {{quote.amount}}\nView: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "quote", "link"],
      properties: {
        ticket: { type: "object" },
        quote: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "delivery_scheduled",
    subject: "Delivery scheduled for {{ticket.number}} on {{stop.window}}",
    bodyHtml:
      "<p>Delivery for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) is scheduled.</p>" +
      "<p>Window: {{stop.window}}<br>Driver: {{driver.name}}</p>",
    bodyText:
      "Delivery for ticket {{ticket.number}} ({{ticket.school}}) is scheduled.\n" +
      "Window: {{stop.window}}\nDriver: {{driver.name}}",
    variables: {
      type: "object",
      required: ["ticket", "stop"],
      properties: {
        ticket: { type: "object" },
        stop: { type: "object" },
        driver: { type: "object" },
      },
    },
  },
  {
    key: "delivery_completed_with_receipt",
    subject: "Delivery completed for {{ticket.number}} — receipt attached",
    bodyHtml:
      "<p>Hi {{recipient.name}},</p>" +
      "<p>Ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) was delivered. The signed receipt is attached.</p>" +
      "<p><a href=\"{{link}}\">View ticket</a></p>",
    bodyText:
      "Hi {{recipient.name}},\n\n" +
      "Ticket {{ticket.number}} ({{ticket.school}}) was delivered. " +
      "The signed receipt is attached.\nView: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        recipient: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "sla_breach_warning",
    subject: "[SLA] {{ticket.number}} approaching breach — {{ticket.daysInState}}d in {{status.label}}",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) is {{ticket.daysInState}} days into <strong>{{status.label}}</strong>.</p>" +
      "<p>Threshold: {{status.slaThreshold}} days. Approaching breach.</p>",
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) is {{ticket.daysInState}} days into {{status.label}}.\n" +
      "Threshold: {{status.slaThreshold}} days. Approaching breach.",
    variables: {
      type: "object",
      required: ["ticket", "status"],
      properties: {
        ticket: { type: "object" },
        status: { type: "object" },
      },
    },
  },
  {
    key: "sla_breached",
    subject: "[SLA] {{ticket.number}} BREACHED — {{ticket.daysInState}}d",
    bodyHtml:
      "<p><strong>{{ticket.number}}</strong> ({{ticket.school}}) has breached SLA.</p>" +
      "<p>{{ticket.daysInState}} days in {{status.label}} (threshold {{status.slaThreshold}} days).</p>",
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) has breached SLA.\n" +
      "{{ticket.daysInState}} days in {{status.label}} (threshold {{status.slaThreshold}} days).",
    variables: {
      type: "object",
      required: ["ticket", "status"],
      properties: {
        ticket: { type: "object" },
        status: { type: "object" },
      },
    },
  },
  {
    key: "daily_digest",
    subject: "BreakFix daily digest — {{date}}",
    bodyHtml:
      "<p>Today's snapshot:</p>" +
      "<ul>" +
      "<li>Open tickets: {{counts.open}}</li>" +
      "<li>SLA breached: {{counts.breached}}</li>" +
      "<li>Quotes awaiting response: {{counts.quotesPending}}</li>" +
      "</ul>",
    bodyText:
      "Today's snapshot:\n" +
      "- Open tickets: {{counts.open}}\n" +
      "- SLA breached: {{counts.breached}}\n" +
      "- Quotes awaiting response: {{counts.quotesPending}}\n",
    variables: {
      type: "object",
      required: ["counts", "date"],
      properties: {
        counts: { type: "object" },
        date: { type: "string" },
      },
    },
  },
  // Round-6 §3A — four highest-impact status-change templates.
  // Keep in sync with src/lib/email/template-seed-data.ts.
  {
    key: "status_in_repair",
    subject: "Ticket {{ticket.number}} is now in repair",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) entered <strong>In repair</strong>.</p>" +
      "<p>{{ticket.summary}}</p>" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) entered In repair.\n" +
      "{{ticket.summary}}\n\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "status_parts_ordered",
    subject: "Parts ordered for {{ticket.number}}",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) is waiting on parts. Status: <strong>Parts ordered</strong>.</p>" +
      "<p>{{ticket.summary}}</p>" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "{{ticket.number}} ({{ticket.school}}): parts ordered.\n" +
      "{{ticket.summary}}\n\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  {
    key: "ticket_closed",
    subject: "Ticket {{ticket.number}} closed",
    bodyHtml:
      "<p>{{ticket.number}} ({{ticket.school}}) is now <strong>Closed</strong>.</p>" +
      "<p>{{ticket.summary}}</p>" +
      "{{#reason}}<p>Reason: {{reason}}</p>{{/reason}}" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "{{ticket.number}} ({{ticket.school}}) is now closed.\n" +
      "{{ticket.summary}}\n" +
      "{{#reason}}Reason: {{reason}}\n{{/reason}}\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        link: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  // Round-7 §3B — quote approved (school user) + pickup completed.
  {
    key: "quote_approved",
    subject: "Quote approved for {{ticket.number}}",
    bodyHtml:
      "<p>Quote for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) was approved.</p>" +
      "{{#reason}}<p>Note: {{reason}}</p>{{/reason}}" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "Quote for ticket {{ticket.number}} ({{ticket.school}}) was approved.\n" +
      "{{#reason}}Note: {{reason}}\n{{/reason}}\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        link: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    key: "pickup_completed",
    subject: "Pickup completed for {{ticket.number}}",
    bodyHtml:
      "<p>Pickup for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) was completed.</p>" +
      "<p>The device is in our hands; you'll see status updates as the repair moves forward.</p>" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "Pickup for ticket {{ticket.number}} ({{ticket.school}}) was completed.\n" +
      "The device is in our hands; you'll see status updates as the repair moves forward.\n\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "link"],
      properties: {
        ticket: { type: "object" },
        link: { type: "string" },
      },
    },
  },
  // Round-6 §3B — manual operator-to-SPOC ticket update.
  {
    key: "ticket_update_to_spoc",
    subject: "Update on {{ticket.number}} ({{ticket.school}})",
    bodyHtml:
      "<p>Hi,</p>" +
      "<p>Quick update on ticket <strong>{{ticket.number}}</strong>:</p>" +
      "<p>{{body}}</p>" +
      "<p>Current status: {{ticket.status}}</p>" +
      '<p><a href="{{link}}">View ticket</a></p>',
    bodyText:
      "Hi,\n\nQuick update on ticket {{ticket.number}}:\n\n" +
      "{{body}}\n\n" +
      "Current status: {{ticket.status}}\n\n" +
      "View ticket: {{link}}",
    variables: {
      type: "object",
      required: ["ticket", "body", "link"],
      properties: {
        ticket: { type: "object" },
        body: { type: "string" },
        link: { type: "string" },
      },
    },
  },
  // Round-20 — NY team batch.
  {
    key: "pickup_scheduled",
    subject: "Pickup scheduled for {{ticket.number}} on {{stop.window}}",
    bodyHtml:
      "<p>Pickup for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) is scheduled.</p>" +
      "<p>Window: {{stop.window}}<br>Driver: {{driver.name}}</p>" +
      "<p>Please have the device(s) ready at the main office.</p>",
    bodyText:
      "Pickup for ticket {{ticket.number}} ({{ticket.school}}) is scheduled.\n" +
      "Window: {{stop.window}}\nDriver: {{driver.name}}\n\n" +
      "Please have the device(s) ready at the main office.",
    variables: {
      type: "object",
      required: ["ticket", "stop"],
      properties: {
        ticket: { type: "object" },
        stop: { type: "object" },
        driver: { type: "object" },
      },
    },
  },
  {
    key: "stop_delayed",
    subject:
      "{{visit.kind}} for {{ticket.number}} is running late — {{delay.reason}}",
    bodyHtml:
      "<p>The scheduled {{visit.kind}} for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) is delayed.</p>" +
      "<p>Reason: {{delay.reason}}<br>New estimate: about {{delay.minutes}} minutes later than planned.</p>" +
      "{{#delay.note}}<p>Note from the team: {{delay.note}}</p>{{/delay.note}}" +
      "<p>We apologise for the inconvenience — the driver is still on the way.</p>",
    bodyText:
      "The scheduled {{visit.kind}} for ticket {{ticket.number}} ({{ticket.school}}) is delayed.\n" +
      "Reason: {{delay.reason}}\n" +
      "New estimate: about {{delay.minutes}} minutes later than planned.\n" +
      "{{#delay.note}}Note from the team: {{delay.note}}\n{{/delay.note}}" +
      "\nWe apologise for the inconvenience — the driver is still on the way.",
    variables: {
      type: "object",
      required: ["ticket", "delay", "visit"],
      properties: {
        ticket: { type: "object" },
        delay: { type: "object" },
        visit: { type: "object" },
      },
    },
  },
  {
    key: "stop_delayed_downstream",
    subject:
      "Your {{visit.kind}} for {{ticket.number}} may run late today",
    bodyHtml:
      "<p>Heads up — an earlier stop on today's route is running behind, so the scheduled {{visit.kind}} for ticket <strong>{{ticket.number}}</strong> ({{ticket.school}}) may arrive later than planned.</p>" +
      "<p>Estimated additional delay: about {{delay.minutes}} minutes.{{#delay.reason}} Cause: {{delay.reason}}.{{/delay.reason}}</p>" +
      "<p>The driver is still on the way — thank you for your patience.</p>",
    bodyText:
      "Heads up - an earlier stop on today's route is running behind, so the scheduled {{visit.kind}} for ticket {{ticket.number}} ({{ticket.school}}) may arrive later than planned.\n" +
      "Estimated additional delay: about {{delay.minutes}} minutes.{{#delay.reason}} Cause: {{delay.reason}}.{{/delay.reason}}\n" +
      "\nThe driver is still on the way - thank you for your patience.",
    variables: {
      type: "object",
      required: ["ticket", "delay", "visit"],
      properties: {
        ticket: { type: "object" },
        delay: { type: "object" },
        visit: { type: "object" },
      },
    },
  },
  {
    key: "report_operations",
    subject: "{{report.periodLabel}} operations report — {{report.rangeLabel}}",
    bodyHtml:
      "<p>{{report.periodLabel}} operations summary for {{report.rangeLabel}}.</p>" +
      "<pre style=\"font-family:monospace;white-space:pre-wrap\">{{report.lines}}</pre>",
    bodyText:
      "{{report.periodLabel}} operations summary for {{report.rangeLabel}}.\n\n{{report.lines}}",
    variables: {
      type: "object",
      required: ["report"],
      properties: {
        report: { type: "object" },
      },
    },
  },
  {
    key: "report_finance",
    subject: "{{report.periodLabel}} finance report — {{report.rangeLabel}}",
    bodyHtml:
      "<p>{{report.periodLabel}} finance summary for {{report.rangeLabel}}.</p>" +
      "<pre style=\"font-family:monospace;white-space:pre-wrap\">{{report.lines}}</pre>",
    bodyText:
      "{{report.periodLabel}} finance summary for {{report.rangeLabel}}.\n\n{{report.lines}}",
    variables: {
      type: "object",
      required: ["report"],
      properties: {
        report: { type: "object" },
      },
    },
  },
  {
    // Round-22 §4 — per-site weekly/monthly status summary (external POC).
    key: "report_site",
    subject:
      "{{report.school}} — {{report.periodLabel}} status ({{report.rangeLabel}})",
    bodyHtml:
      "<p>Status summary for <strong>{{report.school}}</strong> — {{report.periodLabel}} ({{report.rangeLabel}}).</p>" +
      "<pre style=\"font-family:monospace;white-space:pre-wrap\">{{report.lines}}</pre>",
    bodyText:
      "Status summary for {{report.school}} — {{report.periodLabel}} ({{report.rangeLabel}}).\n\n{{report.lines}}",
    variables: {
      type: "object",
      required: ["report"],
      properties: {
        report: { type: "object" },
      },
    },
  },
];

/**
 * Round-11 §1E — exported so prisma/seed.ts and the post-deploy
 * backfill can invoke the upsert loop without triggering the
 * direct-run process.exit. The previous shape relied on a side-
 * effect import which silently failed in production, leaving the
 * EmailTemplate table empty.
 */
export async function seedEmailTemplates(
  client: PrismaClient = prisma,
): Promise<number> {
  let upserted = 0;
  for (const seed of TEMPLATE_SEEDS) {
    await client.emailTemplate.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        subject: seed.subject,
        bodyHtml: seed.bodyHtml,
        bodyText: seed.bodyText,
        variables: seed.variables as unknown as object,
      },
      update: {
        subject: seed.subject,
        bodyHtml: seed.bodyHtml,
        bodyText: seed.bodyText,
        variables: seed.variables as unknown as object,
      },
    });
    upserted++;
  }
  return upserted;
}

async function main() {
  const upserted = await seedEmailTemplates();
  console.log(`[seed-email-templates] upserted ${upserted} template(s).`);
}

// Direct-run guard. tsx supports both CJS and ESM; the ESM check
// uses import.meta.url and the CJS check falls through to the
// require.main heuristic.
const isDirectRun =
  typeof require !== "undefined" && require.main === module;
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

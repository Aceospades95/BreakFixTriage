/**
 * Round-8 §3B — first-run seed.
 *
 * On the first ever app boot (no users yet, no completed setup
 * marker), seeds:
 *
 *   - The standard EmailTemplate library (the same set the admin
 *     "Seed default templates" button writes).
 *   - One Global example EmailRule (ticket_created), disabled by
 *     default. An admin enables it via /admin/email-rules.
 *   - The current year's US federal holidays.
 *
 * Idempotent: if `AppSetting[key='first_run_completed']` is set,
 * the function is a no-op. Safe to call from every request — the
 * one-row read is cheap and short-circuits before any writes.
 *
 * Acceptance per brief: a fresh DB boot creates these without an
 * admin click. /admin/email-rules + /admin/email-templates show
 * the seeded entries on first load.
 */

import { EmailEvent, EmailRuleScope, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TEMPLATE_SEEDS } from "@/lib/email/template-seed-data";

const FLAG_KEY = "first_run_completed";

/**
 * Round-8 §3B — US federal holidays the importer / SLA business-
 * hours code already understands. The list ships current-year
 * dates by reference (computed at call time so the seed picks up
 * the deployment year). Adding a new holiday means appending here
 * AND in the Round-9 backlog item that promotes this to a
 * configurable list.
 */
function buildFederalHolidays(year: number): { name: string; date: Date }[] {
  return [
    { name: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)) },
    { name: "Memorial Day", date: lastMondayOfMonth(year, 4) },
    { name: "Independence Day", date: new Date(Date.UTC(year, 6, 4)) },
    { name: "Labor Day", date: firstMondayOfMonth(year, 8) },
    { name: "Thanksgiving Day", date: nthDayOfMonth(year, 10, 4, 4) },
    { name: "Christmas Day", date: new Date(Date.UTC(year, 11, 25)) },
  ];
}

function firstMondayOfMonth(year: number, month: number): Date {
  for (let d = 1; d <= 7; d++) {
    const date = new Date(Date.UTC(year, month, d));
    if (date.getUTCDay() === 1) return date;
  }
  throw new Error("unreachable");
}

function lastMondayOfMonth(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = lastDay; d >= lastDay - 6; d--) {
    const date = new Date(Date.UTC(year, month, d));
    if (date.getUTCDay() === 1) return date;
  }
  throw new Error("unreachable");
}

function nthDayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month, d));
    if (date.getUTCMonth() !== month) break;
    if (date.getUTCDay() === weekday) {
      count++;
      if (count === n) return date;
    }
  }
  throw new Error("unreachable");
}

let inFlight: Promise<boolean> | null = null;

/**
 * Lazy first-run check. Idempotent + concurrency-safe (a single
 * promise is reused for in-flight callers in the same Node process).
 * Cross-process safety relies on the AppSetting flag — the second
 * caller will see the flag set and short-circuit.
 */
export async function ensureFirstRunSetup(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const flag = await prisma.appSetting.findUnique({
        where: { key: FLAG_KEY },
      });
      if (flag) return false;

      const userCount = await prisma.user.count();
      if (userCount > 0) {
        // Existing deployment — set the flag without seeding so
        // we don't overwrite admin-curated state.
        await prisma.appSetting.upsert({
          where: { key: FLAG_KEY },
          create: { key: FLAG_KEY, value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        });
        return false;
      }

      await runSeedTransaction();
      await prisma.appSetting.upsert({
        where: { key: FLAG_KEY },
        create: { key: FLAG_KEY, value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
      return true;
    } catch (err) {
      console.error("[first-run] seed failed:", err);
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runSeedTransaction(): Promise<void> {
  // Templates first — the example rule references one of them by
  // key, and the rule create FK-checks templateId.
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
      update: {},
    });
  }

  const ticketCreatedTemplate = await prisma.emailTemplate.findUnique({
    where: { key: "ticket_created" },
  });
  if (ticketCreatedTemplate) {
    const existingRule = await prisma.emailRule.findFirst({
      where: {
        scope: EmailRuleScope.GLOBAL,
        event: EmailEvent.ticket_created,
        templateId: ticketCreatedTemplate.id,
      },
    });
    if (!existingRule) {
      await prisma.emailRule.create({
        data: {
          scope: EmailRuleScope.GLOBAL,
          scopeId: null,
          event: EmailEvent.ticket_created,
          templateId: ticketCreatedTemplate.id,
          // Disabled by default — admin enables.
          enabled: false,
          recipients: {
            to: [{ kind: "school_spoc" }, { kind: "ticket_reporter" }],
            cc: [{ kind: "wynndalco_team" }],
            bcc: [],
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  // US federal holidays for the current year. The Holiday model
  // has no @unique on date so we findFirst + create instead of
  // upsert; subsequent first-run calls find the row and skip.
  const year = new Date().getUTCFullYear();
  const holidays = buildFederalHolidays(year);
  for (const h of holidays) {
    const existing = await prisma.holiday.findFirst({
      where: { date: h.date, scope: "GLOBAL", scopeId: null },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: { date: h.date, label: h.name },
      });
    }
  }
}

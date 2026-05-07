/**
 * Round-11 §1E — first-run defaults seeder + production backfill.
 *
 * Three rows-must-exist guarantees for a usable BreakFix Triage
 * install:
 *
 *   1. EmailTemplate — the canonical 8 templates from
 *      prisma/seed-email-templates.ts (ticket_created,
 *      ticket_resolved, etc.)
 *   2. EmailRule — at least one Global rule (disabled) so /admin/
 *      email-rules has a starter row.
 *   3. Holiday — the eleven US federal holidays for the current
 *      year.
 *
 * The function is idempotent: every step does findFirst+create or
 * upsert. Running twice produces zero new rows.
 *
 * Invoke from `npm run db:seed:defaults` after a fresh
 * `prisma migrate deploy` on production. This is the one-time
 * backfill the R11 brief asks for. Re-running is safe.
 */

import { PrismaClient } from "@prisma/client";
import { seedEmailTemplates } from "./seed-email-templates";
import { buildFederalHolidaysForYear } from "../src/lib/holidays/federal";

export interface SeedDefaultsResult {
  templatesUpserted: number;
  ruleCreated: boolean;
  holidaysCreated: number;
  year: number;
}

export async function seedDefaults(
  prisma: PrismaClient,
): Promise<SeedDefaultsResult> {
  const templatesUpserted = await seedEmailTemplates(prisma);

  // Round-2 §8 example rule on `ticket_created`. Disabled by
  // default — admins flip it on once they've reviewed recipients.
  let ruleCreated = false;
  const ticketCreated = await prisma.emailTemplate.findUnique({
    where: { key: "ticket_created" },
  });
  if (ticketCreated) {
    const existingRule = await prisma.emailRule.findFirst({
      where: {
        scope: "GLOBAL",
        event: "ticket_created",
        templateId: ticketCreated.id,
      },
    });
    if (!existingRule) {
      await prisma.emailRule.create({
        data: {
          scope: "GLOBAL",
          scopeId: null,
          event: "ticket_created",
          templateId: ticketCreated.id,
          enabled: false,
          recipients: {
            to: [{ kind: "school_spoc" }, { kind: "ticket_reporter" }],
            cc: [{ kind: "wynndalco_team" }],
            bcc: [],
          } as unknown as object,
        },
      });
      ruleCreated = true;
    }
  }

  // Federal holidays — current year. The eleven-row list lives in
  // src/lib/holidays/federal.ts and is shared with the
  // /admin/holidays "Auto-seed" kebab action.
  const year = new Date().getUTCFullYear();
  const holidays = buildFederalHolidaysForYear(year);
  let holidaysCreated = 0;
  for (const h of holidays) {
    const existing = await prisma.holiday.findFirst({
      where: { date: h.date, scope: "GLOBAL", scopeId: null },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: { date: h.date, label: h.name, scope: "GLOBAL" },
      });
      holidaysCreated++;
    }
  }

  return { templatesUpserted, ruleCreated, holidaysCreated, year };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const r = await seedDefaults(prisma);
    console.log(
      `[seed-defaults] templates=${r.templatesUpserted} ruleCreated=${r.ruleCreated} holidaysCreated=${r.holidaysCreated} year=${r.year}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  typeof require !== "undefined" && require.main === module;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

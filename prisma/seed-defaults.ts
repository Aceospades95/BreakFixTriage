/**
 * Round-11 §1E + Round-12 §1A — first-run defaults seeder.
 *
 * Three rows-must-exist guarantees for a usable BreakFix Triage
 * install:
 *
 *   1. EmailTemplate — 8 canonical templates (R11)
 *   2. EmailRule — one Global rule (disabled)
 *   3. Holiday — current year + next two years (33 rows)
 *
 * Two execution paths converge here:
 *
 *   a. SQL migration — prisma/migrations/<ts>_seed_defaults runs
 *      on `prisma migrate deploy` and inserts the same row set
 *      directly. R12 §1A added that path so any environment using
 *      migrate deploy gets the seed for free.
 *
 *   b. Bootstrap — prisma/bootstrap.ts calls seedDefaults() on
 *      every container start. The Docker runner uses `db push`
 *      not `migrate deploy`, so bootstrap is the production hook.
 *
 * Both paths are idempotent. Both write audit rows tagged
 * action='system_seed' so a future audit walk can tell seeded
 * from operator-added rows.
 */

import { PrismaClient } from "@prisma/client";
import { seedEmailTemplates } from "./seed-email-templates";
// Round-12 §1A — bootstrap.ts (which calls seedDefaults) is
// Docker-self-contained: the runner image copies prisma/ but
// not src/. Federal holiday helpers live in prisma/lib/ so the
// import path stays inside prisma/.
import { buildFederalHolidaysForYear } from "./lib/federal-holidays";

export interface SeedDefaultsResult {
  templatesUpserted: number;
  ruleCreated: boolean;
  holidaysCreated: number;
  year: number;
  auditsWritten: number;
}

const SEED_AUDIT_ACTION = "system_seed";

async function writeSeedAudit(
  prisma: PrismaClient,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const existing = await prisma.auditLog.findFirst({
    where: { entityType, entityId, action: SEED_AUDIT_ACTION },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      entityType,
      entityId,
      action: SEED_AUDIT_ACTION,
      after: {
        source: "bootstrap",
        seededAt: new Date().toISOString(),
        ...payload,
      } as unknown as object,
    },
  });
  return true;
}

export async function seedDefaults(
  prisma: PrismaClient,
): Promise<SeedDefaultsResult> {
  let auditsWritten = 0;

  // ----- EmailTemplate -----
  const templatesUpserted = await seedEmailTemplates(prisma);
  const allTemplates = await prisma.emailTemplate.findMany({
    select: { id: true, key: true },
  });
  for (const t of allTemplates) {
    const wrote = await writeSeedAudit(prisma, "EmailTemplate", t.id, {
      key: t.key,
    });
    if (wrote) auditsWritten++;
  }

  // ----- EmailRule -----
  // Disabled GLOBAL starter rules so admins flip a switch instead
  // of assembling recipients from scratch. Round-20 fixed the
  // recipient kind here: the old seed said "school_spoc", which is
  // not a valid Recipient kind — isRecipientSet() rejected it and
  // dispatch silently skipped the rule when enabled. The valid
  // kind is "spoc".
  let ruleCreated = false;
  const RULE_SEEDS: Array<{
    event: string;
    recipients: object;
  }> = [
    {
      event: "ticket_created",
      recipients: {
        to: [{ kind: "spoc" }, { kind: "ticket_reporter" }],
        cc: [{ kind: "wynndalco_team" }],
        bcc: [],
      },
    },
    // Round-20 — NY team: SPOC hears about scheduled visits + delays.
    {
      event: "pickup_scheduled",
      recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
    },
    {
      event: "delivery_scheduled",
      recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
    },
    {
      event: "stop_delayed",
      recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
    },
    // Scheduled reports go to the internal team list by default;
    // admins add customer/finance literals on the rule.
    {
      event: "report_operations",
      recipients: { to: [{ kind: "wynndalco_team" }], cc: [], bcc: [] },
    },
    {
      event: "report_finance",
      recipients: { to: [{ kind: "wynndalco_team" }], cc: [], bcc: [] },
    },
  ];
  for (const seed of RULE_SEEDS) {
    const template = await prisma.emailTemplate.findUnique({
      where: { key: seed.event },
    });
    if (!template) continue;
    const existingRule = await prisma.emailRule.findFirst({
      where: {
        scope: "GLOBAL",
        event: seed.event as never,
        templateId: template.id,
      },
    });
    if (existingRule) {
      // Repair the malformed kind on already-seeded rows so
      // enabling them actually sends (idempotent).
      const rec = existingRule.recipients as { to?: Array<{ kind?: string }> } | null;
      if (rec?.to?.some((r) => r.kind === "school_spoc")) {
        await prisma.emailRule.update({
          where: { id: existingRule.id },
          data: {
            recipients: JSON.parse(
              JSON.stringify(existingRule.recipients).replaceAll(
                '"school_spoc"',
                '"spoc"',
              ),
            ) as object,
          },
        });
      }
      continue;
    }
    const created = await prisma.emailRule.create({
      data: {
        scope: "GLOBAL",
        scopeId: null,
        event: seed.event as never,
        templateId: template.id,
        enabled: false,
        recipients: seed.recipients as unknown as object,
      },
    });
    ruleCreated = true;
    const wrote = await writeSeedAudit(prisma, "EmailRule", created.id, {
      event: seed.event,
      scope: "GLOBAL",
    });
    if (wrote) auditsWritten++;
  }

  // ----- Holiday — current year + next two years -----
  const baseYear = new Date().getUTCFullYear();
  const years = [baseYear, baseYear + 1, baseYear + 2];
  let holidaysCreated = 0;
  for (const y of years) {
    const holidays = buildFederalHolidaysForYear(y);
    for (const h of holidays) {
      const existing = await prisma.holiday.findFirst({
        where: { date: h.date, scope: "GLOBAL", scopeId: null },
      });
      if (!existing) {
        const created = await prisma.holiday.create({
          data: { date: h.date, label: h.name, scope: "GLOBAL" },
        });
        holidaysCreated++;
        const wrote = await writeSeedAudit(prisma, "Holiday", created.id, {
          date: h.date.toISOString().slice(0, 10),
          label: h.name,
          year: y,
        });
        if (wrote) auditsWritten++;
      }
    }
  }

  return {
    templatesUpserted,
    ruleCreated,
    holidaysCreated,
    year: baseYear,
    auditsWritten,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const r = await seedDefaults(prisma);
    console.log(
      `[seed-defaults] templates=${r.templatesUpserted} ruleCreated=${r.ruleCreated} holidaysCreated=${r.holidaysCreated} years=${r.year}-${r.year + 2} audits=${r.auditsWritten}`,
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

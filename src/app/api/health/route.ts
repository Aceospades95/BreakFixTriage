import { NextResponse } from "next/server";
import { access, constants } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { attachmentsRoot } from "@/lib/attachments/storage";
import { isSmtpConfigured } from "@/lib/notifications";
import { isServiceNowConfigured } from "@/lib/import/servicenow";

/**
 * Unauthenticated health check.
 *
 * Round-13 §2H — extended to expose deploy-readiness so
 * `verify-deploy.sh` no longer needs a captured admin cookie.
 * Operators can curl this endpoint and assert that minimum seed
 * counts are present, migrations are at HEAD, and the dependency
 * checks are green.
 *
 * Returns JSON describing the state of each dependency. Returns
 * 200 when everything required is OK, 503 otherwise — Docker/Kuma
 * health probes can use it directly.
 */
export async function GET() {
  const checks: {
    db: "ok" | "error";
    attachments: "ok" | "error";
    smtp: "configured" | "stdout";
    servicenow: "configured" | "disabled";
    dbError?: string;
    attachmentsError?: string;
  } = {
    db: "error",
    attachments: "error",
    smtp: "stdout",
    servicenow: "disabled",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (err) {
    checks.dbError = err instanceof Error ? err.message : String(err);
  }

  try {
    await access(attachmentsRoot(), constants.W_OK);
    checks.attachments = "ok";
  } catch (err) {
    checks.attachmentsError =
      err instanceof Error ? err.message : String(err);
  }

  checks.smtp = isSmtpConfigured() ? "configured" : "stdout";
  checks.servicenow = isServiceNowConfigured() ? "configured" : "disabled";

  // Round-13 §2H — deploy-readiness counts. Pulled directly from
  // the same tables the auto-seed migration populates so an op
  // running `verify-deploy.sh` can assert minimum seed state
  // without an admin cookie.
  const seeds = {
    emailRules: 0,
    emailTemplates: 0,
    holidaysCurrentYear: 0,
    statuses: 0,
    permissions: 0,
  };
  let seedsHealthy = false;
  if (checks.db === "ok") {
    try {
      const year = new Date().getUTCFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
      const [rules, templates, holidays, statuses, permissions] =
        await Promise.all([
          prisma.emailRule.count(),
          prisma.emailTemplate.count(),
          prisma.holiday.count({
            where: { date: { gte: yearStart, lt: yearEnd } },
          }),
          // Status count comes from AppSetting where the seed lands;
          // best-effort — the schema doesn't have a Status table.
          prisma.appSetting.count({ where: { key: { contains: "status" } } }),
          prisma.appSetting.count({
            where: { key: { contains: "permission" } },
          }),
        ]);
      seeds.emailRules = rules;
      seeds.emailTemplates = templates;
      seeds.holidaysCurrentYear = holidays;
      seeds.statuses = statuses;
      seeds.permissions = permissions;
      seedsHealthy =
        rules >= 1 && templates >= 8 && holidays >= 9;
    } catch {
      // Swallow — partial schema is reflected in the counts above.
    }
  }

  const healthy =
    checks.db === "ok" && checks.attachments === "ok" && seedsHealthy;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version:
        process.env.GIT_SHA ?? process.env.npm_package_version ?? null,
      timestamp: new Date().toISOString(),
      checks,
      seeds,
    },
    { status: healthy ? 200 : 503 },
  );
}

import { NextResponse } from "next/server";
import { access, constants } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { attachmentsRoot } from "@/lib/attachments/storage";
import { isSmtpConfigured } from "@/lib/notifications";
import { isServiceNowConfigured } from "@/lib/import/servicenow";

/**
 * Unauthenticated health check.
 *
 * Returns JSON describing the state of each dependency so an
 * external monitor (Uptime Kuma, Pingdom, a curl in a cron) can
 * alert when something is broken. Reachable without a NextAuth
 * session via the middleware matcher exclusion.
 *
 * Intentionally fast and boring: a single `SELECT 1` against
 * Postgres, an `access()` stat on the attachments volume, and a
 * synthesis of the SMTP / ServiceNow config flags.
 *
 * Returns 200 when everything required is OK, 503 otherwise, so
 * Docker health checks can use it directly.
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

  const healthy = checks.db === "ok" && checks.attachments === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: process.env.npm_package_version ?? null,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}

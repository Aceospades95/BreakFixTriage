/**
 * Round-22 §4 — scheduled per-site status summaries.
 *
 *   npx tsx scripts/send-site-summaries.ts --period=week
 *   npx tsx scripts/send-site-summaries.ts --period=month
 *
 * For every school with activity in the window, builds the same
 * summary the school page + CSV export show, and dispatches a
 * SCHOOL-scoped `report_site` email through the chokepoint. Recipients
 * live on the EmailRule for `report_site` — create a GLOBAL or
 * per-school rule in Admin → Email rules and the school's contacts
 * (the external POC) start receiving it. Nothing sends while no rule
 * is enabled / SMTP is unconfigured, so the cron can be installed
 * before the audience is decided.
 *
 * Suggested crontab (container host):
 *   40 6 * * 1  npm run reports:site:weekly
 *   50 6 1 * *  npm run reports:site:monthly
 */

import { prisma } from "../src/lib/db/prisma";
import { dispatchEmailEvent } from "../src/lib/email/send";
import {
  buildSiteSummary,
  siteSummaryReportVariables,
  periodWindow,
  type SummaryPeriod,
} from "../src/lib/reports/site-summary";

function parsePeriod(): SummaryPeriod {
  const arg = process.argv.find((a) => a.startsWith("--period="));
  const value = arg?.split("=")[1];
  if (value === "week" || value === "month") return value;
  console.error(
    "Usage: tsx scripts/send-site-summaries.ts --period=week|month",
  );
  process.exit(1);
}

async function main() {
  const period = parsePeriod();
  const { from, to } = periodWindow(period);

  // Only schools with activity in the window: a route stop, or an open
  // ticket. Keeps the run from emailing dormant sites.
  const schools = await prisma.school.findMany({
    where: {
      OR: [
        { tickets: { some: { state: { not: "CLOSED" } } } },
        {
          jobs: {
            some: { routeStops: { some: { route: { date: { gte: from, lt: to } } } } },
          },
        },
      ],
    },
    select: { id: true, name: true },
  });

  let dispatched = 0;
  let skipped = 0;
  for (const school of schools) {
    const summary = await buildSiteSummary(school.id, period);
    if (!summary) continue;
    // schoolId drives both the SCHOOL-scoped rule match and the
    // school-contact recipient resolution; a GLOBAL report_site rule
    // also matches and routes each school's summary to its own contacts.
    const sent = await dispatchEmailEvent("report_site", {
      schoolId: school.id,
      variables: siteSummaryReportVariables(summary),
    });
    if (sent.length > 0) dispatched += sent.length;
    else skipped += 1;
  }

  console.log(
    `[reports] site summaries (${period}): ${schools.length} school(s) processed, ${dispatched} email(s) dispatched.`,
  );
  if (dispatched === 0) {
    console.log(
      `[reports] No enabled report_site rule matched (${skipped} school(s) had nothing to send to). ` +
        "Create a report_site rule in Admin → Email rules to start sending; " +
        "the on-page CSV export at /admin/schools/[id] works regardless.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[reports] site summaries failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

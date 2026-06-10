/**
 * Round-20 — scheduled operations + finance reports.
 *
 *   npx tsx scripts/send-scheduled-reports.ts --period=daily
 *   npx tsx scripts/send-scheduled-reports.ts --period=weekly
 *   npx tsx scripts/send-scheduled-reports.ts --period=monthly
 *
 * Builds both report families for the window and dispatches them
 * through the email chokepoint (report_operations /
 * report_finance). Recipients live on the EmailRule for each event
 * — enable the rule and add customer/finance addresses in
 * Admin → Email rules. Nothing sends while the rules are disabled,
 * so the cron can be installed before the audience is decided.
 *
 * Suggested crontab (container host):
 *   10 6 * * *  npm run reports:daily
 *   20 6 * * 1  npm run reports:weekly
 *   30 6 1 * *  npm run reports:monthly
 */

import { prisma } from "../src/lib/db/prisma";
import { dispatchEmailEvent } from "../src/lib/email/send";
import {
  buildFinanceReport,
  buildOperationsReport,
  type ReportPeriod,
} from "../src/lib/reports/scheduled";

function parsePeriod(): ReportPeriod {
  const arg = process.argv.find((a) => a.startsWith("--period="));
  const value = arg?.split("=")[1];
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }
  console.error(
    "Usage: tsx scripts/send-scheduled-reports.ts --period=daily|weekly|monthly",
  );
  process.exit(1);
}

async function main() {
  const period = parsePeriod();

  const [ops, finance] = await Promise.all([
    buildOperationsReport(period, prisma),
    buildFinanceReport(period, prisma),
  ]);

  const opsDispatched = await dispatchEmailEvent("report_operations", {
    variables: {
      report: {
        periodLabel: ops.range.periodLabel,
        rangeLabel: ops.range.rangeLabel,
        lines: ops.lines,
      },
    },
  });
  const finDispatched = await dispatchEmailEvent("report_finance", {
    variables: {
      report: {
        periodLabel: finance.range.periodLabel,
        rangeLabel: finance.range.rangeLabel,
        lines: finance.lines,
      },
    },
  });

  console.log(
    `[reports] ${period}: operations → ${opsDispatched.length} rule(s), finance → ${finDispatched.length} rule(s).`,
  );
  if (opsDispatched.length === 0 && finDispatched.length === 0) {
    console.log(
      "[reports] No enabled report_operations / report_finance email rules — nothing sent. Enable them in Admin → Email rules.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[reports] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Daily digest sender.
 *
 *   npx tsx prisma/send-digest.ts
 *
 * Builds the digest report, renders it as plain text, then writes a
 * Notification row for each configured digest recipient and flushes
 * the notification through the configured transport (stdout or
 * SMTP). Run once a morning from a cron.
 */

import { prisma } from "../src/lib/db/prisma";
import { buildDigestReport, renderDigestText } from "../src/lib/reports/digest";
import { getDigestRecipients } from "../src/lib/settings/settings";
import { dispatchNotification } from "../src/lib/notifications";

async function main() {
  const [report, recipients] = await Promise.all([
    buildDigestReport(),
    getDigestRecipients(),
  ]);
  const body = renderDigestText(report);

  if (recipients.length === 0) {
    console.log(
      "No digest recipients configured. Set them at /admin/settings.",
    );
    console.log(body);
    return;
  }

  const subject = `BreakFix Triage digest — ${report.asOf.toISOString().slice(0, 10)}`;

  for (const email of recipients) {
    const row = await prisma.notification.create({
      data: {
        kind: "GENERIC",
        recipientEmail: email,
        subject,
        body,
        transport: "pending",
      },
    });
    try {
      await dispatchNotification(row.id);
    } catch (err) {
      console.error(
        `failed to dispatch digest to ${email}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(
    JSON.stringify(
      { sentTo: recipients.length, asOf: report.asOf.toISOString() },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

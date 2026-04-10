import { NotificationStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

/**
 * Notification transport abstraction.
 *
 * A transport is a concrete mechanism for delivering a notification:
 *   - `stdout`    → dev default; logs to console
 *   - `smtp`      → plain SMTP (nodemailer-compatible, future)
 *   - `gmail`     → Gmail API via a service account (Phase 4)
 *   - `apps-script` → webhook into an Apps Script endpoint (Phase 4)
 *
 * Phase 0 ships `stdout` only. The point is to give the rest of the system
 * a stable API (`sendNotification`) so later phases can swap transports
 * without touching business logic.
 */

export interface TransportResult {
  ok: boolean;
  error?: string;
}

export interface NotificationTransport {
  readonly name: string;
  send(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }): Promise<TransportResult>;
}

export const StdoutTransport: NotificationTransport = {
  name: "stdout",
  async send({ recipientEmail, subject, body }) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[notification:stdout] to=${recipientEmail}\n  subject: ${subject}\n  body: ${body}\n`,
    );
    return { ok: true };
  },
};

export function getTransport(): NotificationTransport {
  const name = process.env.NOTIFICATION_TRANSPORT ?? "stdout";
  switch (name) {
    case "stdout":
      return StdoutTransport;
    default:
      return StdoutTransport;
  }
}

/**
 * Dispatch a pending notification row. Safe to call from a background
 * worker. Updates Notification.status based on transport result.
 */
export async function dispatchNotification(
  notificationId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n) throw new Error(`Notification ${notificationId} not found`);
  if (n.status !== NotificationStatus.PENDING) return;

  const transport = getTransport();
  const result = await transport.send({
    recipientEmail: n.recipientEmail,
    subject: n.subject,
    body: n.body,
  });

  await db.notification.update({
    where: { id: n.id },
    data: {
      status: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: result.ok ? new Date() : null,
      transport: transport.name,
      error: result.ok ? null : result.error ?? "unknown error",
    },
  });
}

import { NotificationStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import type { NotificationTransport } from "./types";
import { StdoutTransport } from "./stdout";
import { buildSmtpTransport, isSmtpConfigured } from "./smtp";

/**
 * Resolve the notification transport from environment configuration.
 *
 * Precedence:
 *   1. `NOTIFICATION_TRANSPORT=stdout` forces stdout (useful for CI)
 *   2. `NOTIFICATION_TRANSPORT=smtp` enables SMTP — requires SMTP_* envs
 *   3. If SMTP_* envs are populated, SMTP is used automatically
 *   4. Otherwise stdout
 *
 * Keeping this in a single place means the rest of the codebase just
 * calls `dispatchNotification()` without caring how the email actually
 * gets sent.
 */
let cachedTransport: NotificationTransport | null = null;

export function getTransport(): NotificationTransport {
  if (cachedTransport) return cachedTransport;
  const explicit = process.env.NOTIFICATION_TRANSPORT?.toLowerCase();
  if (explicit === "stdout") {
    cachedTransport = StdoutTransport;
    return cachedTransport;
  }
  if (explicit === "smtp" || (!explicit && isSmtpConfigured())) {
    const smtp = buildSmtpTransport();
    if (smtp) {
      cachedTransport = smtp;
      return cachedTransport;
    }
  }
  cachedTransport = StdoutTransport;
  return cachedTransport;
}

/**
 * Test-only helper to reset the cached transport between runs so that
 * env changes are honored.
 */
export function resetTransportCache(): void {
  cachedTransport = null;
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

export type { NotificationTransport, TransportResult } from "./types";
export { StdoutTransport } from "./stdout";

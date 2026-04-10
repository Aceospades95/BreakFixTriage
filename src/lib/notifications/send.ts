/**
 * High-level notification helper.
 *
 * `enqueueNotification` writes a Notification row and immediately tries
 * to dispatch it through the configured transport. This keeps the
 * happy-path synchronous (the UI's "quote sent" flow should feel
 * instant) while still recording a durable row we can retry if the
 * transport hiccups.
 *
 * Callers typically live inside an existing transaction — e.g.
 * `sendQuote` wants the Notification row to land in the same tx as the
 * quote update. When a TransactionClient is passed in, we stay inside
 * it and skip the actual dispatch (the caller is expected to call
 * `dispatchNotification(id)` after the transaction commits; or a
 * background worker will pick it up on its next tick).
 */

import {
  NotificationStatus,
  type NotificationKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { dispatchNotification } from "./transport";

export interface EnqueueNotificationInput {
  kind: NotificationKind;
  ticketId?: string | null;
  quoteId?: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
}

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

function isTransactionClient(
  db: PrismaLike,
): db is Prisma.TransactionClient {
  return typeof (db as PrismaClient).$transaction !== "function";
}

/**
 * Write a PENDING Notification row. If called with a full PrismaClient
 * we also dispatch immediately; if called with a TransactionClient we
 * leave it PENDING so the caller can trigger dispatch after the
 * transaction commits.
 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  db: PrismaLike = defaultPrisma,
): Promise<string> {
  if (!input.recipientEmail || !input.recipientEmail.includes("@")) {
    throw new Error("enqueueNotification: invalid recipientEmail");
  }

  const txClient = db;
  const row = await txClient.notification.create({
    data: {
      kind: input.kind,
      ticketId: input.ticketId ?? null,
      quoteId: input.quoteId ?? null,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      status: NotificationStatus.PENDING,
      transport: "pending",
    },
  });

  if (!isTransactionClient(db)) {
    // Fire and forget the dispatch so the caller isn't blocked on
    // SMTP latency. Failures are recorded on the row, not thrown.
    void dispatchNotification(row.id, db as PrismaClient).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[notifications] dispatch failed for ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }

  return row.id;
}

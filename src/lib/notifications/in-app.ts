/**
 * In-app notification helpers.
 *
 * Kept deliberately minimal: write a row, mark-read by id, mark-all
 * by user. The header bell component reads unread rows directly via
 * Prisma and doesn't go through a service function.
 */

import {
  InAppNotificationKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export interface CreateInAppNotificationInput {
  recipientUserId: string;
  kind: InAppNotificationKind;
  title: string;
  body?: string | null;
  linkHref?: string | null;
}

export async function createInAppNotification(
  input: CreateInAppNotificationInput,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<string> {
  const row = await db.inAppNotification.create({
    data: {
      recipientUserId: input.recipientUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      linkHref: input.linkHref ?? null,
    },
  });
  return row.id;
}

export async function markNotificationRead(
  notificationId: string,
  recipientUserId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.inAppNotification.updateMany({
    where: { id: notificationId, recipientUserId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(
  recipientUserId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.inAppNotification.updateMany({
    where: { recipientUserId, readAt: null },
    data: { readAt: new Date() },
  });
}

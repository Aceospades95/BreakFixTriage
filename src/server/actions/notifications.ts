"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/in-app";

/**
 * Mark a single in-app notification as read. Called from the bell
 * dropdown when the user clicks a notification — redirects to the
 * notification's linkHref (or `/` as a fallback) in the same request
 * so the user lands on the relevant page immediately.
 */
export async function markNotificationReadAction(formData: FormData) {
  const session = await requireSession();
  const id = formData.get("id")?.toString();
  const linkHref = formData.get("linkHref")?.toString() || "/";
  if (id) {
    await markNotificationRead(id, session.userId);
  }
  revalidatePath("/");
  redirect(linkHref);
}

/**
 * Mark every unread notification for the current user as read. Used
 * by the "mark all" button in the bell dropdown.
 */
export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  await markAllNotificationsRead(session.userId);
  revalidatePath("/");
  redirect("/");
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/actions/notifications";

export const dynamic = "force-dynamic";

/**
 * Full notification history for the signed-in user. The header
 * bell shows only the last 20 unread; this page shows the last 200
 * including read, so users can scroll back for context on past
 * escalations and assignments.
 */
export default async function NotificationsPage() {
  const session = await requireSession();

  const [unread, recent] = await Promise.all([
    prisma.inAppNotification.count({
      where: { recipientUserId: session.userId, readAt: null },
    }),
    prisma.inAppNotification.findMany({
      where: { recipientUserId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread of ${recent.length} recent`}
        actions={
          unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button
                type="submit"
                className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
              >
                Mark all read
              </button>
            </form>
          )
        }
      />

      {recent.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
          No notifications yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border bg-surface-muted px-4 py-3 ${n.readAt ? "border-surface-border opacity-60" : "border-accent/60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-surface-border px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase">
                      {n.kind}
                    </span>
                    <span className="text-sm font-medium text-slate-100">
                      {n.title}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-sm text-slate-300">{n.body}</p>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    {n.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    {n.readAt && (
                      <>
                        {" "}
                        · read {n.readAt.toISOString().replace("T", " ").slice(0, 16)}
                      </>
                    )}
                  </div>
                </div>
                {n.linkHref && !n.readAt && (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="linkHref" value={n.linkHref} />
                    <button
                      type="submit"
                      className="rounded bg-accent px-2 py-1 text-xs font-semibold hover:bg-accent-strong"
                    >
                      Open
                    </button>
                  </form>
                )}
                {n.linkHref && n.readAt && (
                  <Link
                    href={n.linkHref}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    open
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

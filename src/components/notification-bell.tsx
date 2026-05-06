import Link from "next/link";
import type { InAppNotification } from "@prisma/client";
import { LocalTime } from "@/components/local-time";
import { PopoverMenu } from "@/components/popover-menu";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/actions/notifications";

/**
 * Notification bell in the header toolbar.
 *
 * Closes findings §3.A4: previously a CSS-only `<details>` element
 * which never closed on outside-click, never closed on route
 * change, and stole mouse interaction from the search field. The
 * dropdown now uses the shared PopoverMenu primitive so dismissal
 * is consistent with HelpMenu and any future header dropdown.
 *
 * Closes findings §5.D bell-grey-at-zero: the badge is now grey at
 * count 0 (no longer always tinted yellow/red).
 */
export function NotificationBell({
  notifications,
}: {
  notifications: InAppNotification[];
}) {
  const count = notifications.length;
  const ariaLabel =
    count > 0 ? `Notifications, ${count} unread` : "Notifications";

  return (
    <PopoverMenu
      panelClassName="w-96 max-w-[calc(100vw-2rem)]"
      trigger={
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex cursor-pointer items-center gap-1 rounded border border-transparent px-2 py-1 text-sm text-slate-300 transition hover:border-surface-border hover:text-white"
        >
          <span className="text-base" aria-hidden="true">🔔</span>
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold text-white"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="rounded-full bg-slate-500/30 px-1.5 text-[10px] font-bold text-slate-300"
            >
              0
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Notifications
        </span>
        {count > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button
              type="submit"
              className="text-[10px] text-slate-400 hover:text-white"
            >
              mark all read
            </button>
          </form>
        )}
      </div>
      {count === 0 ? (
        <div className="p-4 text-center text-xs text-slate-400">
          You're all caught up.
        </div>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-surface-border overflow-auto">
          {notifications.map((n) => (
            <li key={n.id}>
              <form
                action={markNotificationReadAction}
                className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-surface-border/40"
              >
                <input type="hidden" name="id" value={n.id} />
                <input
                  type="hidden"
                  name="linkHref"
                  value={n.linkHref ?? "/"}
                />
                <span
                  className={`mt-0.5 h-2 w-2 rounded-full ${kindColor(n.kind)}`}
                />
                <button type="submit" className="flex-1 text-left">
                  <div className="font-medium text-slate-100">{n.title}</div>
                  {n.body && (
                    <div className="line-clamp-2 text-xs text-slate-400">
                      {n.body}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    <LocalTime date={n.createdAt} mode="relative" />
                  </div>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-surface-border px-3 py-2 text-center text-[10px] text-slate-500">
        <Link href="/notifications" className="hover:text-white">
          View all
        </Link>
      </div>
    </PopoverMenu>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "ESCALATION":
    case "SLA_BREACH":
      return "bg-red-400";
    case "TICKET_ASSIGNED":
      return "bg-indigo-400";
    case "TICKET_MENTION":
      return "bg-violet-400";
    default:
      return "bg-slate-400";
  }
}

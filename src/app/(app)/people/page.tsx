import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { formatRole } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Round-15 — /people directory (graduates backlog B11).
 *
 * Round-13 made /people a redirect to the schedule grid; this
 * graduates it into the directory the R13 decision doc sketched:
 * every active internal user with their role, open-ticket load,
 * and deep links into the surfaces where their work lives —
 * schedule, assigned tickets, and (for admins) the user record.
 *
 * Read-only by design: edits happen on /admin/users; schedule
 * blocks on /scheduling/people.
 */
export default async function PeoplePage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  const [users, openByAssignee] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.ticket.groupBy({
      by: ["assignedUserId"],
      where: {
        assignedUserId: { not: null },
        state: { notIn: ["CLOSED", "OUT_OF_SCOPE"] },
      },
      _count: { _all: true },
    }),
  ]);
  const openCount = new Map(
    openByAssignee.map((g) => [g.assignedUserId, g._count._all]),
  );

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${users.length} active staff. Open-ticket counts exclude closed and out-of-scope work.`}
        actions={
          <Link
            href="/scheduling/people"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            Schedule grid
          </Link>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Open tickets</th>
              <th className="px-4 py-2.5">Go to</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const open = openCount.get(u.id) ?? 0;
              return (
                <tr
                  key={u.id}
                  data-testid="person-row"
                  className="border-t border-surface-border transition hover:bg-surface-muted/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-100">
                      {u.name}
                      {u.id === session.userId && (
                        <span className="ml-1 text-slate-500">· you</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-2.5">{formatRole(u.role)}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {open > 0 ? (
                      <Link
                        href={`/tickets?assignee=${u.id}&state=open`}
                        className="font-medium text-accent underline decoration-accent/40 hover:decoration-accent"
                      >
                        {open}
                      </Link>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <Link
                        href="/scheduling/people"
                        className="text-accent underline decoration-accent/40 hover:decoration-accent"
                      >
                        Schedule
                      </Link>
                      <Link
                        href={`/tickets?assignee=${u.id}`}
                        className="text-accent underline decoration-accent/40 hover:decoration-accent"
                      >
                        Tickets
                      </Link>
                      {isAdmin && (
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-accent underline decoration-accent/40 hover:decoration-accent"
                        >
                          Admin
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

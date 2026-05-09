import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { LocalTime } from "@/components/local-time";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      districts: { include: { district: { select: { name: true } } } },
    },
  });

  // Round-8 §3A — last sign-in per user, derived from the
  // `auth:login` audit row written in lib/auth/auth.ts events.
  // One groupBy across all visible users; users who haven't
  // signed in since the audit hook landed render "—".
  const lastSignIns = await prisma.auditLog.groupBy({
    by: ["actorUserId"],
    where: { action: "auth:login", actorUserId: { not: null } },
    _max: { createdAt: true },
  });
  const lastSignInByUserId = new Map<string, Date>();
  for (const row of lastSignIns) {
    if (row.actorUserId && row._max.createdAt) {
      lastSignInByUserId.set(row.actorUserId, row._max.createdAt);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${users.length} total`}
        actions={
          <Link
            href="/admin/users/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New user
          </Link>
        }
      />

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Districts</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {users.map((u) => (
              <tr key={u.id} className="transition hover:bg-surface-muted/40">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-accent hover:underline"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs text-slate-400">
                  {u.email}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center whitespace-nowrap rounded bg-surface-border px-2 py-0.5 text-[10px] font-medium tracking-wide">
                    {humanise(u.role)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {u.districts.length === 0
                    ? "—"
                    : u.districts
                        .map((du) => du.district.name)
                        .join(", ")}
                </td>
                <td className="px-3 py-2 text-xs">
                  {u.active ? (
                    <span className="text-emerald-300">active</span>
                  ) : (
                    <span className="text-slate-500">disabled</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {lastSignInByUserId.has(u.id) ? (
                    <LocalTime
                      date={lastSignInByUserId.get(u.id)!}
                      mode="relative"
                    />
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

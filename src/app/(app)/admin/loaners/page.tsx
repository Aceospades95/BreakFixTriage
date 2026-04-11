import Link from "next/link";
import { LoanerAssignmentStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Loaner pool. Shows every loaner device with its current checkout
 * status inline. Clicking into a loaner shows the checkout history
 * and lets an admin hand it out or retire it.
 */
export default async function LoanersPage() {
  await requireRole(PERMISSIONS.SCHEDULING_READ);

  const loaners = await prisma.loanerDevice.findMany({
    orderBy: [{ active: "desc" }, { serialNumber: "asc" }],
    include: {
      model: true,
      assignments: {
        where: { status: LoanerAssignmentStatus.ACTIVE },
        include: { school: { select: { name: true } } },
        take: 1,
      },
      _count: { select: { assignments: true } },
    },
  });

  const inUse = loaners.filter((l) => l.assignments.length > 0).length;
  const available = loaners.filter(
    (l) => l.active && l.assignments.length === 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Loaners"
        subtitle={`${loaners.length} total · ${available} available · ${inUse} in use`}
        actions={
          <Link
            href="/admin/loaners/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New loaner
          </Link>
        }
      />

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Asset tag</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Current holder</th>
              <th className="px-3 py-2 font-medium">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loaners.map((l) => {
              const active = l.assignments[0];
              return (
                <tr key={l.id} className="transition hover:bg-surface-muted/40">
                  <td className="px-3 py-2 font-mono">
                    <Link
                      href={`/admin/loaners/${l.id}`}
                      className="text-accent hover:underline"
                    >
                      {l.serialNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {l.assetTag ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.model
                      ? `${l.model.manufacturer} ${l.model.modelName}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {!l.active ? (
                      <span className="text-slate-500">retired</span>
                    ) : active ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200">
                        checked out
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">
                        available
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {active?.school.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{l._count.assignments}</td>
                </tr>
              );
            })}
            {loaners.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No loaners in the pool yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

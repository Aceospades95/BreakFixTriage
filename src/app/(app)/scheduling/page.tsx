import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  await requireRole(PERMISSIONS.SCHEDULING_READ);

  const [routes, unscheduledJobs] = await Promise.all([
    prisma.route.findMany({
      take: 10,
      orderBy: { date: "desc" },
      include: {
        assignee: { select: { name: true } },
        stops: {
          orderBy: { sequence: "asc" },
          include: { job: { include: { school: { select: { name: true } } } } },
        },
      },
    }),
    prisma.job.findMany({
      where: { status: "UNSCHEDULED" },
      take: 30,
      include: {
        school: { select: { name: true } },
        ticketLinks: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Scheduling"
        subtitle="Jobs, routes, and assignments. Full route-builder UI ships in Phase 2."
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Recent routes
        </h2>
        <ul className="space-y-3">
          {routes.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {r.date.toISOString().slice(0, 10)} — {r.assignee.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {r.stops.length} stops · optimizer={r.optimizerName ?? "—"}
                  </div>
                </div>
                <span className="rounded bg-surface-border px-2 py-0.5 font-mono text-xs">
                  {r.status}
                </span>
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-300">
                {r.stops.map((s) => (
                  <li key={s.id}>
                    {s.job.school.name}{" "}
                    <span className="font-mono text-xs text-slate-500">
                      ({s.job.type})
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
          {routes.length === 0 && (
            <li className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
              No routes yet.
            </li>
          )}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Unscheduled jobs
        </h2>
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">School</th>
                <th className="px-3 py-2 font-medium">Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {unscheduledJobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 font-mono text-xs">{j.type}</td>
                  <td className="px-3 py-2">{j.school.name}</td>
                  <td className="px-3 py-2">{j.ticketLinks.length}</td>
                </tr>
              ))}
              {unscheduledJobs.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    Nothing waiting to be scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

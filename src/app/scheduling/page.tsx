import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  const [routes, unscheduledJobs] = await Promise.all([
    prisma.route.findMany({
      take: 10,
      orderBy: { date: "desc" },
      include: {
        assignee: true,
        stops: { include: { job: { include: { school: true } } } },
      },
    }),
    prisma.job.findMany({
      where: { status: "UNSCHEDULED" },
      take: 20,
      include: { school: true, ticketLinks: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scheduling</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Home
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Recent routes</h2>
        <ul className="mt-3 divide-y divide-surface-border rounded border border-surface-border">
          {routes.map((r) => (
            <li key={r.id} className="p-4">
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
              <ol className="mt-2 list-decimal pl-5 text-sm text-slate-300">
                {r.stops
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((s) => (
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
            <li className="px-3 py-8 text-center text-sm text-slate-400">
              No routes yet.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Unscheduled jobs</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left">
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
    </main>
  );
}

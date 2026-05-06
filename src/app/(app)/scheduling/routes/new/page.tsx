import Link from "next/link";
import { JobStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { buildRouteAction } from "@/server/actions/scheduling";

export const dynamic = "force-dynamic";

const DRIVER_ROLES: Role[] = [
  Role.DRIVER,
  Role.TECHNICIAN,
  Role.OPS_MANAGER,
  Role.DISPATCHER,
  Role.ADMIN,
];

export default async function NewRoutePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.ROUTES_BUILD);

  const [unscheduledJobs, driverCandidates] = await Promise.all([
    prisma.job.findMany({
      where: { status: JobStatus.UNSCHEDULED },
      orderBy: { createdAt: "asc" },
      include: {
        school: {
          select: { name: true, code: true, address: { select: { latitude: true, longitude: true } } },
        },
        ticketLinks: true,
      },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: DRIVER_ROLES } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  // Default date = today, UTC.
  const now = new Date();
  const isoDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title="Build route"
        subtitle="Pick jobs, assign a driver, and let the optimizer sequence the stops."
        actions={
          <Link
            href="/scheduling"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ← Back
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {unscheduledJobs.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
          No unscheduled jobs. Create some from the{" "}
          <Link href="/scheduling" className="text-accent hover:underline">
            scheduling dashboard
          </Link>
          .
        </div>
      ) : (
        <form action={buildRouteAction} className="space-y-6">
          <div className="grid gap-4 rounded-lg border border-surface-border bg-surface-muted/60 p-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Date
              </span>
              <input
                type="date"
                name="date"
                defaultValue={isoDate}
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Assigned to
              </span>
              <select
                name="assigneeUserId"
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">Choose a driver…</option>
                {driverCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Vehicle (optional)
              </span>
              <input
                type="text"
                name="vehicleRef"
                placeholder="VAN-02"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-muted/60">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Unscheduled jobs
              </h2>
              <span className="text-xs text-slate-400">
                {unscheduledJobs.length} total
              </span>
            </div>
            <ul className="divide-y divide-surface-border">
              {unscheduledJobs.map((j) => {
                const hasCoords =
                  j.school.address?.latitude != null &&
                  j.school.address?.longitude != null;
                return (
                  <li key={j.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      name="jobIds"
                      value={j.id}
                      defaultChecked
                      className="mt-1 h-4 w-4 accent-accent"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="rounded bg-surface-border px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase">
                          {j.type}
                        </span>
                        <span>{j.school.name}</span>
                        {j.school.code && (
                          <span className="font-medium tracking-tight text-xs text-slate-500">
                            {j.school.code}
                          </span>
                        )}
                        {!hasCoords && (
                          <span
                            title="School has no coordinates — this job will be appended in insertion order."
                            className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200"
                          >
                            no coords
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {j.ticketLinks.length} ticket
                        {j.ticketLinks.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
            >
              Optimize &amp; save route
            </button>
            <Link
              href="/scheduling"
              className="rounded border border-surface-border px-4 py-2 text-sm text-slate-300 hover:border-accent"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </>
  );
}

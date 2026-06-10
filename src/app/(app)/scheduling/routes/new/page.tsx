import Link from "next/link";
import { JobStatus, JobType, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { formatRole } from "@/lib/format";
import {
  groupReadyTicketsBySchool,
  type ReadyTicketGroup,
} from "@/lib/scheduling/ready-groups";
import {
  buildRouteAction,
  createJobAction,
} from "@/server/actions/scheduling";

export const dynamic = "force-dynamic";

const DRIVER_ROLES: Role[] = [
  Role.DRIVER,
  Role.TECHNICIAN,
  Role.OPS_MANAGER,
  Role.DISPATCHER,
  Role.ADMIN,
];

/**
 * Route builder.
 *
 * Round-17 — made self-sufficient after field QA: the page now
 * offers the "ready to schedule" ticket groups inline, so an
 * operator can go ticket → job → routed without bouncing between
 * pages, and the empty state explains the flow instead of being a
 * dead end.
 */
export default async function NewRoutePage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  await requireRole(PERMISSIONS.ROUTES_BUILD);

  const [
    unscheduledJobs,
    driverCandidates,
    pickupGroups,
    deliveryGroups,
    onsiteGroups,
  ] = await Promise.all([
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
    groupReadyTicketsBySchool("AWAITING_PICKUP", JobType.PICKUP),
    groupReadyTicketsBySchool("PENDING_DELIVERY", JobType.DELIVERY),
    groupReadyTicketsBySchool("AWAITING_ONSITE", JobType.ONSITE_REPAIR),
  ]);

  const readySections: Array<{
    title: string;
    jobType: JobType;
    groups: ReadyTicketGroup[];
  }> = [
    { title: "Pickups", jobType: JobType.PICKUP, groups: pickupGroups },
    { title: "Deliveries", jobType: JobType.DELIVERY, groups: deliveryGroups },
    {
      title: "On-site visits",
      jobType: JobType.ONSITE_REPAIR,
      groups: onsiteGroups,
    },
  ].filter((s) => s.groups.length > 0);
  const readyCount = readySections.reduce(
    (a, s) => a + s.groups.reduce((b, g) => b + g.tickets.length, 0),
    0,
  );

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
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      {driverCandidates.length === 0 && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          No active users can be assigned a route. Add a driver (or
          technician/dispatcher) under{" "}
          <Link
            href="/admin/users"
            className="underline decoration-amber-400/50 hover:decoration-amber-300"
          >
            Admin → Users
          </Link>{" "}
          first.
        </div>
      )}

      {unscheduledJobs.length === 0 ? (
        <div className="mb-6 rounded border border-surface-border bg-surface-muted/40 p-5 text-sm text-slate-300">
          <p className="font-semibold text-slate-200">
            How routes come together
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
            <li>
              Tickets become ready when they reach{" "}
              <em>Awaiting pickup</em>, <em>Pending delivery</em>, or{" "}
              <em>Awaiting onsite</em>.
            </li>
            <li>
              Schedule a school&apos;s tickets below — that stages them as
              a stop.
            </li>
            <li>Pick a driver and save; the optimizer orders the stops.</li>
          </ol>
          {readyCount === 0 && (
            <p className="mt-3 text-slate-400">
              Nothing is ready to schedule right now. Move a ticket to{" "}
              <em>Awaiting pickup</em> from its detail page and it will
              appear here.
            </p>
          )}
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
                    {u.name} ({formatRole(u.role)})
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
                placeholder="e.g. VAN-02"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-muted/60">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Stops on this route
              </h2>
              <span className="text-xs text-slate-400">
                {unscheduledJobs.length} staged
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
                      aria-label={`Include ${j.school.name}`}
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

      {/* Round-17 — ready tickets are schedulable right here; each
          button stages the school's tickets as a stop and reloads
          this page with it checked above. */}
      {readySections.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Ready to schedule
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {readyCount} ticket{readyCount === 1 ? "" : "s"} can be added
            to this route. Scheduling a school stages it as a stop above.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
            {readySections.map((section) => (
              <div
                key={section.jobType}
                className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
              >
                <h3 className="mb-3 text-sm font-semibold">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.groups.map((g) => (
                    <li
                      key={g.schoolId}
                      className="rounded border border-surface-border bg-surface px-3 py-2"
                    >
                      <div className="text-sm font-medium">
                        {g.schoolName}
                        {g.schoolCode && (
                          <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
                            {g.schoolCode}
                          </span>
                        )}
                      </div>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                        {g.tickets.slice(0, 5).map((t) => (
                          <li key={t.id} className="flex gap-2">
                            <Link
                              href={`/tickets/${t.incidentNumber}`}
                              className="font-medium tracking-tight text-accent hover:underline"
                            >
                              {t.incidentNumber}
                            </Link>
                            <span className="truncate text-slate-400">
                              {t.shortDescription}
                            </span>
                          </li>
                        ))}
                        {g.tickets.length > 5 && (
                          <li className="text-slate-500">
                            …and {g.tickets.length - 5} more
                          </li>
                        )}
                      </ul>
                      <form action={createJobAction} className="mt-2">
                        <input
                          type="hidden"
                          name="type"
                          value={section.jobType}
                        />
                        <input
                          type="hidden"
                          name="schoolId"
                          value={g.schoolId}
                        />
                        <input type="hidden" name="returnTo" value="builder" />
                        {g.tickets.map((t) => (
                          <input
                            key={t.id}
                            type="hidden"
                            name="ticketIds"
                            value={t.id}
                          />
                        ))}
                        <button
                          type="submit"
                          className="rounded bg-accent px-2 py-1 text-[11px] font-semibold hover:bg-accent-strong"
                        >
                          Schedule {g.tickets.length} as a stop
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

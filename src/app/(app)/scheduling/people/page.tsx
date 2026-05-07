import { Role, StaffScheduleKind } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise, formatRole } from "@/lib/format";
import { getPeopleScheduleForDate } from "@/lib/scheduling/people";
import {
  createScheduleBlockAction,
  deleteScheduleBlockAction,
} from "@/server/actions/staff-schedule";

export const dynamic = "force-dynamic";

const SCHEDULABLE_ROLES: Role[] = [
  "TECHNICIAN",
  "DISPATCHER",
  "WAREHOUSE",
  "OPS_MANAGER",
  "ADMIN",
  "DRIVER",
];

const KIND_COLORS: Record<StaffScheduleKind, string> = {
  WAREHOUSE: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  ON_ROUTE: "border-teal-500/40 bg-teal-500/15 text-teal-100",
  PTO: "border-violet-500/40 bg-violet-500/15 text-violet-100",
  TRAINING: "border-sky-500/40 bg-sky-500/15 text-sky-100",
  OUT_OF_OFFICE: "border-slate-500/40 bg-slate-500/15 text-slate-100",
  MEETING: "border-indigo-500/40 bg-indigo-500/15 text-indigo-100",
};

const HOUR_LABELS = [
  "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p",
];

/**
 * Round-4 §N2 — /scheduling/people.
 *
 * Day grid of active staff with their persisted blocks + derived
 * ON_ROUTE blocks (synthesised from `Route` rows). The brief's
 * Week / Day toggle reuses the §K calendar primitive once it
 * lands; this page ships Day mode first.
 *
 * RBAC:
 *   - Read: any logged-in user.
 *   - Write (create / delete): ADMIN / OPS_MANAGER / DISPATCHER.
 *     Self-serve writes happen on /me/schedule.
 */
export default async function PeopleSchedulingPage({
  searchParams,
}: {
  searchParams?: { date?: string; error?: string; ok?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canWrite = can(session.role, PERMISSIONS.SCHEDULING_WRITE);

  const date = parseDateParam(searchParams?.date);
  // Settings.peopleSchedule* lookup. Falls back to 8am-6pm.
  // (Round-4 §N2 schema deltas don't add the columns — the
  // brief's "Settings keys" defaulted in `lib/settings/`. This
  // page uses 8-18 as the fallback until the keys are wired.)
  const dayStartMinute = 8 * 60;
  const dayEndMinute = 18 * 60;

  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: SCHEDULABLE_ROLES },
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, role: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  // Pin the current user first (per the brief).
  const sortedUsers = [
    ...users.filter((u) => u.id === session.userId),
    ...users.filter((u) => u.id !== session.userId),
  ];

  const blocks = await getPeopleScheduleForDate(
    date,
    userIds,
    { dayStartMinute, dayEndMinute },
    prisma,
  );
  const blocksByUser = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const list = blocksByUser.get(b.userId) ?? [];
    list.push(b);
    blocksByUser.set(b.userId, list);
  }

  const totalRoutes = blocks.filter((b) => b.kind === "ON_ROUTE").length;
  const totalPersisted = blocks.filter((b) => !b.__derived).length;

  return (
    <>
      <PageHeader
        title="People schedule"
        subtitle={
          `${date.toISOString().slice(0, 10)} · ${sortedUsers.length} staff · ${totalPersisted} block${totalPersisted === 1 ? "" : "s"}` +
          ` · ${totalRoutes} on route`
        }
        actions={
          <a
            href={`/scheduling/people?date=${shiftDate(date, -1).toISOString().slice(0, 10)}`}
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ←
          </a>
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

      {/* Day grid: rows = staff, columns = hours 8a–5p (10 columns).
          ON_ROUTE blocks render in teal; persisted blocks in their
          kind colour. Tooltip shows kind + note + (derived). */}
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="min-w-full text-xs">
          <thead className="bg-surface-muted text-left tracking-wide text-slate-400">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2 font-medium">
                Staff
              </th>
              {HOUR_LABELS.map((h) => (
                <th key={h} className="px-2 py-2 text-center font-medium">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Add</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {sortedUsers.map((u) => {
              const userBlocks = blocksByUser.get(u.id) ?? [];
              return (
                <tr key={u.id}>
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                    <div className="font-medium">
                      {u.name}
                      {u.id === session.userId && (
                        <span className="ml-1 text-slate-500">· you</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {formatRole(u.role)}
                    </div>
                  </td>
                  {/* The 10 hour cells span the whole row; we render
                      blocks as a single absolute-positioned overlay
                      using a relative wrapper. To keep this page
                      server-component-only (no client primitive yet),
                      we render the blocks inline as a flex row.
                      Round-4 §K extracts a shared Calendar primitive;
                      this page upgrades to use it then. */}
                  <td colSpan={HOUR_LABELS.length} className="px-2 py-2">
                    {userBlocks.length === 0 ? (
                      <span className="text-slate-500">no blocks</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {userBlocks.map((b) => (
                          <span
                            key={b.id}
                            title={[
                              `${humanise(b.kind)}`,
                              `${formatMinutes(b.startMinute)}–${formatMinutes(b.endMinute)}`,
                              b.note ?? "",
                              b.__derived ? "(derived from route)" : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            className={
                              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 " +
                              KIND_COLORS[b.kind]
                            }
                          >
                            <span>{humanise(b.kind)}</span>
                            <span className="opacity-70">
                              {formatMinutes(b.startMinute)}–
                              {formatMinutes(b.endMinute)}
                            </span>
                            {!b.__derived && canWrite && (
                              <form
                                action={deleteScheduleBlockAction}
                                className="inline"
                              >
                                <input type="hidden" name="id" value={b.id} />
                                <ConfirmButton
                                  message={`Delete ${humanise(b.kind)} block ${formatMinutes(b.startMinute)}–${formatMinutes(b.endMinute)} for ${u.name}?`}
                                  className="ml-1 px-1 py-0 text-[10px]"
                                >
                                  ×
                                </ConfirmButton>
                              </form>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {canWrite && (
                      <details className="text-right">
                        <summary className="cursor-pointer rounded border border-surface-border px-2 py-0.5 text-[11px] text-slate-300 hover:border-accent">
                          + Add
                        </summary>
                        <form
                          action={createScheduleBlockAction}
                          className="mt-1 grid gap-1 rounded border border-surface-border bg-surface-muted/40 p-2"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={u.id}
                          />
                          <input
                            type="hidden"
                            name="date"
                            value={date.toISOString()}
                          />
                          <select
                            name="kind"
                            defaultValue={StaffScheduleKind.WAREHOUSE}
                            className="rounded border border-surface-border bg-surface px-1 py-0.5 text-[11px]"
                          >
                            {Object.values(StaffScheduleKind)
                              .filter((k) => k !== StaffScheduleKind.ON_ROUTE)
                              .map((k) => (
                                <option key={k} value={k}>
                                  {humanise(k)}
                                </option>
                              ))}
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              name="startMinute"
                              min={0}
                              max={24 * 60 - 1}
                              defaultValue={dayStartMinute}
                              className="w-16 rounded border border-surface-border bg-surface px-1 py-0.5 text-[11px]"
                              required
                            />
                            <input
                              type="number"
                              name="endMinute"
                              min={1}
                              max={24 * 60}
                              defaultValue={dayEndMinute}
                              className="w-16 rounded border border-surface-border bg-surface px-1 py-0.5 text-[11px]"
                              required
                            />
                          </div>
                          <input
                            type="text"
                            name="note"
                            placeholder="note (optional)"
                            className="rounded border border-surface-border bg-surface px-1 py-0.5 text-[11px]"
                          />
                          <button
                            type="submit"
                            className="rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-strong"
                          >
                            Save
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        On-route blocks come from the route schedule itself — edit the
        route to change them.
      </p>
    </>
  );
}

function parseDateParam(s: string | undefined): Date {
  if (s) {
    const d = new Date(s + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) return d;
  }
  const today = new Date();
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      0,
      0,
      0,
    ),
  );
}

function shiftDate(d: Date, deltaDays: number): Date {
  return new Date(d.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h < 12 ? "a" : "p";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}

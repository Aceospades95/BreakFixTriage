import { StaffScheduleKind } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { humanise } from "@/lib/format";
import {
  createScheduleBlockAction,
  deleteScheduleBlockAction,
} from "@/server/actions/staff-schedule";

export const dynamic = "force-dynamic";

/**
 * Round-4 §N2 — /me/schedule.
 *
 * Self-serve PTO / OOO / TRAINING add + cancel. Other kinds
 * (WAREHOUSE, MEETING) require Ops; the form here is restricted
 * to the self-serve kinds and the server action enforces the same
 * restriction (defence-in-depth).
 *
 * The brief's "list of upcoming PTO/OOO" is the read view here;
 * the create form is the inline mini-form. Adding more polish
 * (calendar week-view picker, recurrence) is filed for the §N2
 * follow-up.
 */
export default async function MyScheduleePage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireSession();

  // Show today and the next 30 days. The brief mentions
  // "upcoming"; the daily view at /scheduling/people drills
  // further back.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

  const blocks = await prisma.staffSchedule.findMany({
    where: {
      userId: session.userId,
      date: { gte: start, lt: end },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="My schedule"
        subtitle="Self-serve PTO, OOO, and training. Other kinds (warehouse, meetings) are scheduled by Ops."
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

      <section className="mb-6 rounded-lg border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
          Add a block
        </h2>
        <form
          action={createScheduleBlockAction}
          className="grid gap-3 sm:grid-cols-[160px_140px_120px_120px_1fr_auto]"
        >
          <input type="hidden" name="userId" value={session.userId} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Date
            </span>
            <input
              type="date"
              name="date"
              required
              defaultValue={start.toISOString().slice(0, 10)}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Kind
            </span>
            <select
              name="kind"
              defaultValue={StaffScheduleKind.PTO}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {[
                StaffScheduleKind.PTO,
                StaffScheduleKind.OUT_OF_OFFICE,
                StaffScheduleKind.TRAINING,
              ].map((k) => (
                <option key={k} value={k}>
                  {humanise(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Start (min)
            </span>
            <input
              type="number"
              name="startMinute"
              min={0}
              max={24 * 60 - 1}
              required
              defaultValue={9 * 60}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              End (min)
            </span>
            <input
              type="number"
              name="endMinute"
              min={1}
              max={24 * 60}
              required
              defaultValue={17 * 60}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Note
            </span>
            <input
              type="text"
              name="note"
              maxLength={500}
              placeholder="optional"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold hover:bg-accent-strong"
            >
              Add
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Times are entered as minutes from midnight (e.g. 9 AM = 540,
          5 PM = 1020). Hour-and-minute pickers and recurring blocks are
          on the roadmap.
        </p>
      </section>

      {blocks.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          Nothing scheduled in the next 30 days.
        </div>
      ) : (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="w-28 text-slate-300">
                {b.date.toISOString().slice(0, 10)}
              </span>
              <span className="rounded border border-surface-border px-2 py-0.5 text-[11px] text-slate-200">
                {humanise(b.kind)}
              </span>
              <span className="text-xs text-slate-500">
                {formatMinutes(b.startMinute)}–{formatMinutes(b.endMinute)}
              </span>
              {b.note && (
                <span className="text-xs text-slate-400">{b.note}</span>
              )}
              <form
                action={deleteScheduleBlockAction}
                className="ml-auto"
              >
                <input type="hidden" name="id" value={b.id} />
                <ConfirmButton
                  message={`Delete this ${humanise(b.kind)} block on ${b.date.toISOString().slice(0, 10)}?`}
                  className="text-xs"
                >
                  Cancel
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h < 12 ? "a" : "p";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}

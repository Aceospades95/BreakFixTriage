import { HolidayScope } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { ScopeAndDistrict } from "./scope-and-district";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import {
  upsertHolidayAction,
  deleteHolidayAction,
} from "@/server/actions/holidays";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A2 — holidays admin.
 *
 * Add / edit / delete Holiday rows. Each row feeds the
 * business-hours SLA math. The brief's "calendar grid by year"
 * UI is filed for the §A follow-up; this page ships a list view
 * + add form because that's the bare minimum to stop SLA being
 * wrong on Memorial Day.
 */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string; year?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const year =
    parseInt(searchParams?.year ?? String(new Date().getFullYear()), 10) ||
    new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00Z`);

  const [holidays, districts] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    }),
    prisma.district.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Holidays"
        subtitle={`${holidays.length} entr${holidays.length === 1 ? "y" : "ies"} for ${year} · feeds business-hours SLA math`}
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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <a
          href={`?year=${year - 1}`}
          className="rounded border border-surface-border px-2.5 py-0.5 hover:border-accent"
        >
          ← {year - 1}
        </a>
        <span className="font-semibold">{year}</span>
        <a
          href={`?year=${year + 1}`}
          className="rounded border border-surface-border px-2.5 py-0.5 hover:border-accent"
        >
          {year + 1} →
        </a>
      </div>

      <section className="mb-8 rounded-lg border border-surface-border bg-surface-muted/40 p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
          Add holiday
        </h2>
        <form
          action={upsertHolidayAction}
          className="grid gap-3 sm:grid-cols-[160px_1fr_140px_180px_auto]"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Date
            </span>
            <input
              type="date"
              name="date"
              required
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-slate-400">
              Label
            </span>
            <input
              type="text"
              name="label"
              required
              maxLength={120}
              placeholder="e.g. Memorial Day"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <ScopeAndDistrict
            districts={districts.map((d) => ({ id: d.id, name: d.name }))}
          />
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold hover:bg-accent-strong"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      {holidays.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No holidays in {year} yet.
        </div>
      ) : (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border">
          {holidays.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="w-28 text-slate-300">
                {h.date.toISOString().slice(0, 10)}
              </span>
              <span className="flex-1">{h.label}</span>
              <span className="rounded border border-surface-border px-2 py-0.5 text-[10px] text-slate-300">
                {humanise(h.scope)}
                {h.scope === HolidayScope.DISTRICT && h.scopeId && (
                  <span className="ml-1 text-slate-500">
                    {districts.find((d) => d.id === h.scopeId)?.code ?? "?"}
                  </span>
                )}
              </span>
              <form action={deleteHolidayAction}>
                <input type="hidden" name="id" value={h.id} />
                <ConfirmButton
                  className="text-xs"
                  message={`Delete the holiday "${h.label}" on ${h.date.toISOString().slice(0, 10)}? This cannot be undone.`}
                >
                  Delete
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

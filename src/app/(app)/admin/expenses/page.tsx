import Link from "next/link";
import { ExpenseStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise, formatCents } from "@/lib/format";
import { compileExpenseWeek, weekStartOf } from "@/lib/reports/expenses";
import { reviewExpenseAction } from "@/server/actions/expenses";

export const dynamic = "force-dynamic";

/**
 * Round-20 — NY team: weekly expense review.
 *
 * One week per view (Mon–Sun), one section per tech, with the
 * locations serviced pulled from the linked route/school. Approve /
 * reject inline; the weekly finance email compiles the same data.
 */
export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string; week?: string };
}) {
  await requireRole(PERMISSIONS.EXPENSES_REVIEW);

  const anchor =
    searchParams?.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? new Date(`${searchParams.week}T00:00:00.000Z`)
      : new Date();
  const week = await compileExpenseWeek(anchor, prisma);
  const prevWeek = new Date(
    weekStartOf(anchor).getTime() - 7 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const nextWeek = new Date(
    weekStartOf(anchor).getTime() + 7 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`Week ${week.weekStart} – ${week.weekEnd} · ${formatCents(week.totalCents)} submitted/approved · ${formatCents(week.approvedCents)} approved`}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`?week=${prevWeek}`}
              className="rounded border border-surface-border px-3 py-1.5 transition hover:border-accent"
            >
              ← Prev week
            </Link>
            <Link
              href={`?week=${nextWeek}`}
              className="rounded border border-surface-border px-3 py-1.5 transition hover:border-accent"
            >
              Next week →
            </Link>
            <a
              href={`/api/exports/expenses?week=${week.weekStart}`}
              className="rounded border border-surface-border px-3 py-1.5 transition hover:border-accent"
              title="Download this week as CSV"
            >
              Export CSV
            </a>
          </div>
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

      {week.techs.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No expenses submitted for this week. Techs file them from
          their <code className="rounded bg-surface-muted px-1">My expenses</code>{" "}
          page (profile menu).
        </div>
      ) : (
        <div className="space-y-6">
          {week.techs.map((t) => (
            <section
              key={t.techUserId}
              data-testid="expense-tech-section"
              className="rounded-lg border border-surface-border bg-surface-muted/40 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  {t.techName}
                </h2>
                <span className="text-xs text-slate-400">
                  {t.lines.length} item{t.lines.length === 1 ? "" : "s"} ·{" "}
                  {formatCents(t.totalCents)} total ·{" "}
                  {formatCents(t.approvedCents)} approved
                </span>
              </div>
              <ul className="divide-y divide-surface-border rounded border border-surface-border">
                {t.lines.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="w-24 text-slate-300">{l.incurredOn}</span>
                    <span className="rounded border border-surface-border px-2 py-0.5 text-[11px]">
                      {humanise(l.kind)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCents(l.amountCents)}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                        l.status === "APPROVED"
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                          : l.status === "REJECTED"
                            ? "border-red-500/40 bg-red-500/15 text-red-200"
                            : "border-amber-500/40 bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {humanise(l.status)}
                    </span>
                    {l.location && (
                      <span className="text-xs text-slate-400">
                        {l.location}
                      </span>
                    )}
                    {l.description && (
                      <span className="text-xs text-slate-500">
                        {l.description}
                      </span>
                    )}
                    {l.status === "SUBMITTED" && (
                      <span className="ml-auto flex items-center gap-2">
                        <form action={reviewExpenseAction}>
                          <input type="hidden" name="expenseId" value={l.id} />
                          <input
                            type="hidden"
                            name="decision"
                            value={ExpenseStatus.APPROVED}
                          />
                          <button
                            type="submit"
                            className="rounded bg-emerald-500/80 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={reviewExpenseAction}>
                          <input type="hidden" name="expenseId" value={l.id} />
                          <input
                            type="hidden"
                            name="decision"
                            value={ExpenseStatus.REJECTED}
                          />
                          <button
                            type="submit"
                            className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
                          >
                            Reject
                          </button>
                        </form>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

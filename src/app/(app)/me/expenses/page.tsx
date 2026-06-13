import { ExpenseKind, ExpenseStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PhotoCapture } from "@/components/photo-capture";
import { AttachmentList } from "@/components/attachment-list";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { humanise, formatCents } from "@/lib/format";
import {
  deleteOwnExpenseAction,
  submitExpenseAction,
} from "@/server/actions/expenses";
import { uploadAttachmentAction } from "@/server/actions/attachments";

export const dynamic = "force-dynamic";

/**
 * Round-20 — NY team: bus-fare receipts.
 *
 * Techs submit transit/toll/parking expenses with a receipt photo;
 * each can be pinned to one of their recent routes so the weekly
 * finance report shows the locations serviced. Review happens on
 * /admin/expenses.
 */
export default async function MyExpensesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireSession();

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [expenses, myRecentRoutes] = await Promise.all([
    prisma.expense.findMany({
      where: { techUserId: session.userId },
      orderBy: { incurredOn: "desc" },
      take: 50,
      include: {
        route: { select: { id: true, date: true, vehicleRef: true } },
        school: { select: { name: true } },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { name: true } } },
        },
      },
    }),
    prisma.route.findMany({
      where: { assigneeUserId: session.userId, date: { gte: since } },
      orderBy: { date: "desc" },
      take: 14,
      select: {
        id: true,
        date: true,
        stops: {
          take: 1,
          orderBy: { sequence: "asc" },
          select: { job: { select: { school: { select: { name: true } } } } },
        },
      },
    }),
  ]);

  const totalPendingCents = expenses
    .filter((e) => e.status === ExpenseStatus.SUBMITTED)
    .reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <>
      <PageHeader
        title="My expenses"
        subtitle="Bus fare, tolls, parking — submit with a receipt photo; ops reviews and the weekly finance report compiles them."
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
          Submit an expense
        </h2>
        {/* Round-22 §4 — key on the expense count so the form remounts
            and clears after a successful submit; App Router's soft
            navigation otherwise preserves the typed-in values, which
            invited an accidental double-submit. */}
        <form
          key={expenses.length}
          action={submitExpenseAction}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Date
            </span>
            <input
              type="date"
              name="incurredOn"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Kind
            </span>
            <select
              name="kind"
              defaultValue={ExpenseKind.TRANSIT}
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            >
              {Object.values(ExpenseKind).map((k) => (
                <option key={k} value={k}>
                  {humanise(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Amount ($)
            </span>
            <input
              type="text"
              name="amount"
              required
              inputMode="decimal"
              placeholder="2.90"
              className="w-24 rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Route (optional)
            </span>
            <select
              name="routeId"
              defaultValue=""
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">— not tied to a route —</option>
              {myRecentRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.date.toISOString().slice(0, 10)}
                  {r.stops[0]?.job.school.name
                    ? ` · ${r.stops[0].job.school.name}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              What for
            </span>
            <input
              type="text"
              name="description"
              maxLength={500}
              placeholder="e.g. Bx12 bus to Kennedy HS"
              className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Submit
          </button>
        </form>
      </section>

      {expenses.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No expenses yet. Submit your first one above — keep the paper
          receipt until it&apos;s approved.
        </div>
      ) : (
        <>
          <div className="mb-2 text-xs text-slate-400">
            {expenses.length} expense{expenses.length === 1 ? "" : "s"} ·{" "}
            {formatCents(totalPendingCents)} awaiting review
          </div>
          <ul className="space-y-3">
            {expenses.map((e) => (
              <li
                key={e.id}
                data-testid="expense-row"
                className="rounded-lg border border-surface-border bg-surface-muted/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="w-24 text-slate-300">
                    {e.incurredOn.toISOString().slice(0, 10)}
                  </span>
                  <span className="rounded border border-surface-border px-2 py-0.5 text-[11px]">
                    {humanise(e.kind)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCents(e.amountCents)}
                  </span>
                  <ExpenseStatusPill status={e.status} />
                  {e.route && (
                    <span className="text-xs text-slate-400">
                      route {e.route.date.toISOString().slice(0, 10)}
                      {e.school ? ` · ${e.school.name}` : ""}
                    </span>
                  )}
                  {e.description && (
                    <span className="text-xs text-slate-400">
                      {e.description}
                    </span>
                  )}
                  {e.status === ExpenseStatus.SUBMITTED && (
                    <form action={deleteOwnExpenseAction} className="ml-auto">
                      <input type="hidden" name="expenseId" value={e.id} />
                      <ConfirmButton
                        message="Withdraw this expense? It is removed entirely."
                        className="text-xs text-slate-400 hover:text-red-200"
                      >
                        Withdraw
                      </ConfirmButton>
                    </form>
                  )}
                </div>
                <div className="mt-3 border-t border-surface-border pt-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    Receipt ({e.attachments.length})
                  </div>
                  <AttachmentList
                    attachments={e.attachments}
                    ownerKind="EXPENSE"
                    ownerId={e.id}
                    returnTo="/me/expenses"
                    canWrite={false}
                  />
                  {e.status === ExpenseStatus.SUBMITTED && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <PhotoCapture
                        action={uploadAttachmentAction}
                        ownerKind="EXPENSE"
                        ownerId={e.id}
                        returnTo="/me/expenses"
                      />
                      {/* Round-22 §4 — the page promises a receipt photo;
                          give an explicit file upload (PDF/image) too, not
                          camera-only. */}
                      <ActionForm
                        action={uploadAttachmentAction}
                        encType="multipart/form-data"
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="kind" value="EXPENSE" />
                        <input type="hidden" name="expenseId" value={e.id} />
                        <input type="hidden" name="returnTo" value="/me/expenses" />
                        <label className="text-[10px] text-slate-400">
                          <span className="sr-only">Upload receipt file</span>
                          <input
                            type="file"
                            name="file"
                            required
                            accept="image/*,application/pdf"
                            className="max-w-44 rounded border border-surface-border bg-surface px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-0.5 file:text-[10px] file:font-semibold file:text-white"
                          />
                        </label>
                        <button
                          type="submit"
                          className="rounded border border-surface-border px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-accent hover:text-white"
                        >
                          Upload file
                        </button>
                      </ActionForm>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ExpenseStatusPill({ status }: { status: ExpenseStatus }) {
  const cls: Record<ExpenseStatus, string> = {
    SUBMITTED: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    APPROVED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    REJECTED: "bg-red-500/20 text-red-200 border-red-500/40",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls[status]}`}
    >
      {humanise(status)}
    </span>
  );
}

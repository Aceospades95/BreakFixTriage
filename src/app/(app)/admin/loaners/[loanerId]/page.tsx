import Link from "next/link";
import { notFound } from "next/navigation";
import { LoanerAssignmentStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  checkOutLoanerAction,
  returnLoanerAction,
} from "@/server/actions/loaners";

export const dynamic = "force-dynamic";

export default async function LoanerDetailPage({
  params,
  searchParams,
}: {
  params: { loanerId: string };
  searchParams?: { error?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canWrite = can(session.role, PERMISSIONS.SCHEDULING_WRITE);

  const [loaner, schools] = await Promise.all([
    prisma.loanerDevice.findUnique({
      where: { id: params.loanerId },
      include: {
        model: true,
        assignments: {
          orderBy: { createdAt: "desc" },
          include: {
            school: { select: { id: true, name: true } },
            ticket: { select: { id: true, incidentNumber: true } },
            checkedOutBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.school.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  if (!loaner) notFound();

  const activeAssignment = loaner.assignments.find(
    (a) => a.status === LoanerAssignmentStatus.ACTIVE,
  );

  return (
    <>
      <PageHeader
        title={loaner.serialNumber}
        subtitle={
          loaner.model
            ? `${loaner.model.manufacturer} ${loaner.model.modelName}`
            : "Unknown model"
        }
        actions={
          <Link
            href="/admin/loaners"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Loaners
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-muted p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Status
          </h2>
          {activeAssignment ? (
            <div className="space-y-2 text-sm">
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="text-xs uppercase tracking-wide text-amber-200">
                  Checked out
                </div>
                <div className="mt-1 font-medium">
                  {activeAssignment.school.name}
                </div>
                {activeAssignment.contactName && (
                  <div className="text-xs text-slate-400">
                    to {activeAssignment.contactName}
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-400">
                  since{" "}
                  {activeAssignment.checkedOutAt.toISOString().slice(0, 10)}
                  {activeAssignment.dueBackAt && (
                    <>
                      {" "}
                      · due back{" "}
                      {activeAssignment.dueBackAt.toISOString().slice(0, 10)}
                    </>
                  )}
                </div>
                {activeAssignment.ticket && (
                  <div className="mt-1 text-xs">
                    For ticket{" "}
                    <Link
                      href={`/tickets/${activeAssignment.ticket.id}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {activeAssignment.ticket.incidentNumber}
                    </Link>
                  </div>
                )}
              </div>

              {canWrite && (
                <form action={returnLoanerAction} className="mt-3 space-y-2">
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={activeAssignment.id}
                  />
                  <select
                    name="status"
                    defaultValue={LoanerAssignmentStatus.RETURNED}
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value={LoanerAssignmentStatus.RETURNED}>
                      Returned to shop
                    </option>
                    <option value={LoanerAssignmentStatus.LOST}>
                      Mark lost
                    </option>
                  </select>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Optional notes"
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
                  >
                    Close assignment
                  </button>
                </form>
              )}
            </div>
          ) : loaner.active ? (
            <div className="space-y-2">
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Available in the shop
              </div>

              {canWrite && (
                <form
                  action={checkOutLoanerAction}
                  className="mt-3 space-y-2 border-t border-surface-border pt-3"
                >
                  <input type="hidden" name="loanerId" value={loaner.id} />
                  <label className="block text-[10px] uppercase tracking-wide text-slate-400">
                    Check out to school
                  </label>
                  <select
                    name="schoolId"
                    required
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">— pick a school —</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.code && `(${s.code})`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="contactName"
                    placeholder="Received by (name)"
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  <input
                    type="date"
                    name="dueBackAt"
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    name="ticketId"
                    placeholder="Related ticket id (optional)"
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs font-mono focus:border-accent focus:outline-none"
                  />
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Notes"
                    className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
                  >
                    Check out
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="rounded border border-slate-500/40 bg-slate-500/10 p-3 text-sm text-slate-400">
              Retired
            </div>
          )}

          {loaner.notes && (
            <div className="mt-4 border-t border-surface-border pt-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                {loaner.notes}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            History ({loaner.assignments.length})
          </h2>
          {loaner.assignments.length === 0 ? (
            <p className="text-sm text-slate-400">
              This loaner has never been checked out.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {loaner.assignments.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-surface-border bg-surface px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.school.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                        a.status === "ACTIVE"
                          ? "bg-amber-500/20 text-amber-200"
                          : a.status === "LOST"
                            ? "bg-red-500/20 text-red-200"
                            : "bg-emerald-500/20 text-emerald-200"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    out {a.checkedOutAt.toISOString().slice(0, 10)}
                    {a.returnedAt && (
                      <>
                        {" "}
                        → returned {a.returnedAt.toISOString().slice(0, 10)}
                      </>
                    )}
                    {a.checkedOutBy && (
                      <> · by {a.checkedOutBy.name}</>
                    )}
                  </div>
                  {a.ticket && (
                    <div className="mt-1 text-xs">
                      ticket{" "}
                      <Link
                        href={`/tickets/${a.ticket.id}`}
                        className="font-mono text-accent hover:underline"
                      >
                        {a.ticket.incidentNumber}
                      </Link>
                    </div>
                  )}
                  {a.notes && (
                    <div className="mt-1 text-xs text-slate-400">
                      {a.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

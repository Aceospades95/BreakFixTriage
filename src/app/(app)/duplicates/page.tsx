import Link from "next/link";
import { DuplicateResolution, type Prisma, type TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { resolveDuplicateAction } from "@/server/actions/duplicates";

export const dynamic = "force-dynamic";

const ticketSelect = {
  id: true,
  incidentNumber: true,
  state: true,
  shortDescription: true,
  reportedAt: true,
  school: { select: { name: true } },
} satisfies Prisma.TicketSelect;

type ConflictTicket = {
  id: string;
  incidentNumber: string;
  state: TicketState;
  shortDescription: string;
  reportedAt: Date;
  school: { name: string };
};

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams?: { error?: string; show?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canResolve = can(session.role, PERMISSIONS.DUPLICATES_RESOLVE);
  const showResolved = searchParams?.show === "resolved";

  const conflicts = await prisma.duplicateConflict.findMany({
    where: showResolved ? { resolvedAt: { not: null } } : { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      leftTicket: { select: ticketSelect },
      rightTicket: { select: ticketSelect },
    },
  });

  return (
    <>
      <PageHeader
        title="Duplicate queue"
        subtitle={
          showResolved
            ? "Previously resolved conflicts"
            : "Conflicts flagged by the importer that need operator review"
        }
        actions={
          <Link
            href={
              showResolved ? "/duplicates" : "/duplicates?show=resolved"
            }
            className="text-sm text-slate-400 hover:text-white"
          >
            {showResolved ? "← Unresolved" : "Show resolved →"}
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <ul className="space-y-4">
        {conflicts.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
          >
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-surface-border px-2 py-0.5 font-medium tracking-tight">
                {c.kind}
              </span>
              <span>{c.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              {c.resolvedAt && (
                <span className="ml-auto font-medium tracking-tight text-emerald-300">
                  {c.resolution}
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ConflictSide label="Existing" ticket={c.leftTicket} />
              <ConflictSide label="Incoming" ticket={c.rightTicket} />
            </div>

            {c.notes && (
              <p className="mt-2 text-sm text-slate-400">{c.notes}</p>
            )}

            {canResolve && !c.resolvedAt && (
              <form
                action={resolveDuplicateAction}
                className="mt-4 flex flex-wrap items-end gap-2 border-t border-surface-border pt-3"
              >
                <input type="hidden" name="conflictId" value={c.id} />
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Resolution
                  </span>
                  <select
                    name="resolution"
                    defaultValue={DuplicateResolution.TREAT_AS_REOPEN}
                    className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value={DuplicateResolution.TREAT_AS_REOPEN}>
                      Treat as reopen
                    </option>
                    <option value={DuplicateResolution.KEEP_BOTH}>
                      Keep both
                    </option>
                    <option value={DuplicateResolution.REJECT_NEW}>
                      Reject new
                    </option>
                    <option value={DuplicateResolution.MERGE_INTO_LEFT}>
                      Merge into existing
                    </option>
                    <option value={DuplicateResolution.MERGE_INTO_RIGHT}>
                      Merge into incoming
                    </option>
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Reason
                  </span>
                  <input
                    type="text"
                    name="reason"
                    placeholder="Why this resolution?"
                    className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-accent px-3 py-1.5 text-xs font-semibold transition hover:bg-accent-strong"
                >
                  Resolve
                </button>
              </form>
            )}
          </li>
        ))}
        {conflicts.length === 0 && (
          <li className="rounded border border-surface-border bg-surface-muted/40 p-8 text-center text-sm text-slate-400">
            {showResolved
              ? "No resolved conflicts yet."
              : "The queue is clean. No pending duplicate conflicts."}
          </li>
        )}
      </ul>
    </>
  );
}

function ConflictSide({
  label,
  ticket,
}: {
  label: string;
  ticket: ConflictTicket;
}) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="block rounded border border-surface-border bg-surface p-3 transition hover:border-accent"
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <StatePill state={ticket.state} />
      </div>
      <div className="mt-1 font-medium tracking-tight text-sm text-accent">
        {ticket.incidentNumber}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        {ticket.school.name} ·{" "}
        {ticket.reportedAt.toISOString().slice(0, 10)}
      </div>
      <div className="mt-1 line-clamp-2 text-sm text-slate-200">
        {ticket.shortDescription}
      </div>
    </Link>
  );
}

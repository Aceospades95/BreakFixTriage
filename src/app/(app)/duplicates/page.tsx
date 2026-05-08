import Link from "next/link";
import {
  DuplicateResolution,
  TicketState as TicketStateEnum,
  type Prisma,
  type TicketState,
} from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  linkSyntheticToIncidentAction,
  resolveDuplicateAction,
} from "@/server/actions/duplicates";

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

  const [conflicts, unlinkedSynthetics] = await Promise.all([
    prisma.duplicateConflict.findMany({
      where: showResolved ? { resolvedAt: { not: null } } : { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        leftTicket: { select: ticketSelect },
        rightTicket: { select: ticketSelect },
      },
    }),
    showResolved
      ? Promise.resolve([] as Array<{
          id: string;
          incidentNumber: string;
          shortDescription: string;
          reportedAt: Date;
          state: TicketState;
          school: { name: string };
          device: { serialNumber: string; assetTag: string | null } | null;
        }>)
      : prisma.ticket.findMany({
          where: { state: TicketStateEnum.PENDING_PICKUP_UNLINKED },
          orderBy: { reportedAt: "desc" },
          take: 50,
          select: {
            id: true,
            incidentNumber: true,
            shortDescription: true,
            reportedAt: true,
            state: true,
            school: { select: { name: true } },
            device: { select: { serialNumber: true, assetTag: true } },
          },
        }),
  ]);

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

      {!showResolved && unlinkedSynthetics.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-100">
            On-route synthetic tickets awaiting SNOW link
            <span className="rounded bg-violet-500/20 px-2 py-0.5 text-xs font-medium tabular-nums text-violet-100">
              {unlinkedSynthetics.length}
            </span>
          </h2>
          <p className="mb-3 text-xs text-violet-300/80">
            Each card below is a synthetic ticket minted by a tech on a
            route stop. Link it to its real SNOW incident number to fold
            the synthetic side into the SNOW record.
          </p>
          <ul className="space-y-3">
            {unlinkedSynthetics.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tickets/${t.incidentNumber}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {t.incidentNumber}
                  </Link>
                  <span
                    className="rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100"
                    title="Synthetic ticket — created on the route, not yet linked to SNOW."
                  >
                    SYN
                  </span>
                  <StatePill state={t.state} />
                  <span className="text-xs text-slate-400">
                    {t.school.name}
                    {t.device &&
                      ` · ${t.device.assetTag ?? t.device.serialNumber}`}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {t.reportedAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-200">
                  {t.shortDescription}
                </div>
                {canResolve && (
                  <form
                    action={linkSyntheticToIncidentAction}
                    className="mt-3 flex flex-wrap items-end gap-2 border-t border-violet-500/30 pt-3"
                  >
                    <input
                      type="hidden"
                      name="syntheticTicketId"
                      value={t.id}
                    />
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] tracking-wide text-violet-200/80">
                        SNOW INC#
                      </span>
                      <input
                        type="text"
                        name="targetIncidentNumber"
                        required
                        // Round-11 §1B — placeholder is a concrete
                        // example so the format is unmistakable.
                        // Renders italic in light violet so it
                        // can't be mistaken for a real value.
                        placeholder="e.g. INC1234567"
                        className="w-44 rounded border border-violet-500/40 bg-violet-500/5 px-2 py-1 text-sm font-medium uppercase tracking-tight placeholder:normal-case placeholder:text-violet-400/40 placeholder:italic focus:border-violet-300 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[10px] tracking-wide text-violet-200/80">
                        Reason
                      </span>
                      <input
                        type="text"
                        name="reason"
                        placeholder="optional"
                        className="rounded border border-violet-500/40 bg-violet-500/5 px-2 py-1 text-sm focus:border-violet-300 focus:outline-none"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded border border-violet-300/60 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-50 hover:bg-violet-500/30"
                    >
                      Link to SNOW
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
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
        {conflicts.length === 0 &&
          // Round-10 §1A — only show "queue is clean" when BOTH the
          // SNOW conflicts list AND the synthetic-pending list are
          // empty. Showing both at once contradicts itself.
          (showResolved || unlinkedSynthetics.length === 0) && (
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
      href={`/tickets/${ticket.incidentNumber}`}
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

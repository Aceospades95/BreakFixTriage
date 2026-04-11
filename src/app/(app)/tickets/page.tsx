import Link from "next/link";
import { TicketState, type Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  bulkAssignAction,
  bulkTransitionAction,
} from "@/server/actions/bulk";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: {
    state?: string;
    q?: string;
    page?: string;
    error?: string;
    ok?: string;
  };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canWrite = can(session.role, PERMISSIONS.TICKETS_WRITE);
  const canTransition = can(session.role, PERMISSIONS.TICKETS_TRANSITION);

  const stateParam = searchParams?.state;
  const validStates = Object.values(TicketState) as string[];
  const stateFilter =
    stateParam && validStates.includes(stateParam)
      ? (stateParam as TicketState)
      : undefined;
  const query = searchParams?.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);

  const where: Prisma.TicketWhereInput = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(query
      ? {
          OR: [
            {
              incidentNumber: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              shortDescription: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [tickets, total, assignableUsers] = await Promise.all([
    prisma.ticket.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      orderBy: { reportedAt: "desc" },
      include: {
        school: true,
        device: true,
        assignee: { select: { name: true } },
      },
    }),
    prisma.ticket.count({ where }),
    canWrite
      ? prisma.user.findMany({
          where: {
            active: true,
            role: {
              in: ["TECHNICIAN", "WAREHOUSE", "DISPATCHER", "OPS_MANAGER", "ADMIN"],
            },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allStates = Object.values(TicketState);
  const returnTo = `/tickets?${new URLSearchParams({
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(query ? { q: query } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  }).toString()}`;

  return (
    <>
      <PageHeader
        title="Tickets"
        subtitle={`${total.toLocaleString()} matching ticket${total === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/tickets/kanban"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Kanban view
            </Link>
            <Link
              href="/bench"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Tech bench
            </Link>
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

      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/40 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Incident or description"
            className="w-64 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            State
          </span>
          <select
            name="state"
            defaultValue={stateFilter ?? ""}
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">All states</option>
            {allStates.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 text-sm font-semibold transition hover:bg-accent-strong"
        >
          Apply
        </button>
        {(query || stateFilter) && (
          <Link
            href="/tickets"
            className="text-xs text-slate-400 hover:text-white"
          >
            Clear filters
          </Link>
        )}
        <div className="ml-auto">
          <a
            href={`/api/exports/tickets?${new URLSearchParams({
              ...(stateFilter ? { state: stateFilter } : {}),
              ...(query ? { q: query } : {}),
            }).toString()}`}
            className="rounded border border-surface-border px-3 py-1 text-sm transition hover:border-accent"
            title="Download matching tickets as CSV"
          >
            ⬇ Export CSV
          </a>
        </div>
      </form>

      {canTransition && tickets.length > 0 && (
        <BulkActionForm
          tickets={tickets}
          assignableUsers={assignableUsers}
          returnTo={returnTo}
        />
      )}

      {!canTransition && (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <TicketTable tickets={tickets} />
        </div>
      )}

      {pageCount > 1 && (
        <Pagination
          page={page}
          pageCount={pageCount}
          query={query}
          state={stateFilter}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bulk action form (client-free: buttons submit the enclosing form to
// different actions via the `formAction` attribute)
// ---------------------------------------------------------------------------

function BulkActionForm({
  tickets,
  assignableUsers,
  returnTo,
}: {
  tickets: Array<{
    id: string;
    incidentNumber: string;
    state: TicketState;
    stateEnteredAt: Date | null;
    reportedAt: Date;
    shortDescription: string;
    school: { name: string };
    device: { serialNumber: string } | null;
    assignee: { name: string } | null;
  }>;
  assignableUsers: { id: string; name: string; role: string }[];
  returnTo: string;
}) {
  return (
    <form>
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="mb-2 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/40 p-3 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Bulk actions
        </span>
        <label className="flex items-center gap-1">
          Transition to:
          <select
            name="to"
            defaultValue=""
            className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="" disabled>
              pick state…
            </option>
            {Object.values(TicketState).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="reason"
            placeholder="reason (optional)"
            className="w-40 rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            formAction={bulkTransitionAction}
            className="rounded bg-accent px-2 py-0.5 text-xs font-semibold hover:bg-accent-strong"
          >
            Apply
          </button>
        </label>
        <label className="flex items-center gap-1">
          Assign to:
          <select
            name="assigneeUserId"
            defaultValue=""
            className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="">— unassign —</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            formAction={bulkAssignAction}
            className="rounded bg-accent px-2 py-0.5 text-xs font-semibold hover:bg-accent-strong"
          >
            Apply
          </button>
        </label>
        <span className="text-slate-500">
          Actions apply to checked rows only.
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <TicketTable tickets={tickets} withCheckbox />
      </div>
    </form>
  );
}

function TicketTable({
  tickets,
  withCheckbox = false,
}: {
  tickets: Array<{
    id: string;
    incidentNumber: string;
    state: TicketState;
    stateEnteredAt: Date | null;
    reportedAt: Date;
    shortDescription: string;
    school: { name: string };
    device: { serialNumber: string } | null;
    assignee: { name: string } | null;
  }>;
  withCheckbox?: boolean;
}) {
  return (
    <table className="min-w-full divide-y divide-surface-border text-sm">
      <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
        <tr>
          {withCheckbox && <th className="px-2 py-2" />}
          <th className="px-3 py-2 font-medium">Incident</th>
          <th className="px-3 py-2 font-medium">State</th>
          <th className="px-3 py-2 font-medium">SLA</th>
          <th className="px-3 py-2 font-medium">Assignee</th>
          <th className="px-3 py-2 font-medium">School</th>
          <th className="px-3 py-2 font-medium">Device</th>
          <th className="px-3 py-2 font-medium">Summary</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-border">
        {tickets.map((t) => (
          <tr key={t.id} className="transition hover:bg-surface-muted/40">
            {withCheckbox && (
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  name="ticketIds"
                  value={t.id}
                  className="h-4 w-4 accent-accent"
                />
              </td>
            )}
            <td className="px-3 py-2">
              <Link
                href={`/tickets/${t.id}`}
                className="font-mono text-accent hover:underline"
              >
                {t.incidentNumber}
              </Link>
            </td>
            <td className="px-3 py-2">
              <StatePill state={t.state} />
            </td>
            <td className="px-3 py-2">
              <SlaBadge ticket={t} compact />
            </td>
            <td className="px-3 py-2 text-xs text-slate-300">
              {t.assignee?.name ?? (
                <span className="text-slate-500">—</span>
              )}
            </td>
            <td className="px-3 py-2">{t.school.name}</td>
            <td className="px-3 py-2 font-mono text-xs text-slate-400">
              {t.device?.serialNumber ?? "—"}
            </td>
            <td className="px-3 py-2 text-slate-300">
              <span className="line-clamp-1">{t.shortDescription}</span>
            </td>
          </tr>
        ))}
        {tickets.length === 0 && (
          <tr>
            <td
              colSpan={withCheckbox ? 8 : 7}
              className="px-3 py-8 text-center text-slate-400"
            >
              No tickets match the current filters. Try clearing them or
              run an import.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Pagination({
  page,
  pageCount,
  query,
  state,
}: {
  page: number;
  pageCount: number;
  query: string;
  state: TicketState | undefined;
}) {
  const mkHref = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (state) sp.set("state", state);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
      <span>
        Page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={mkHref(page - 1)}
            className="rounded border border-surface-border px-3 py-1 hover:border-accent"
          >
            ← Prev
          </Link>
        )}
        {page < pageCount && (
          <Link
            href={mkHref(page + 1)}
            className="rounded border border-surface-border px-3 py-1 hover:border-accent"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

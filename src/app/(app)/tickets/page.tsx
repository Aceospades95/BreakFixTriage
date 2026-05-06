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
import { createTicketFromTemplateAction } from "@/server/actions/templates";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: {
    state?: string;
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
    school?: string;
    manufacturer?: string;
    assignee?: string;
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

  // Sort parsing. The `sort` param is the column key; `dir` is asc|desc.
  // Limits sort keys to the ones with a real database column so
  // Prisma can execute the orderBy without a join.
  type SortKey =
    | "reportedAt"
    | "state"
    | "priority"
    | "incidentNumber"
    | "stateEnteredAt";
  const validSortKeys: SortKey[] = [
    "reportedAt",
    "state",
    "priority",
    "incidentNumber",
    "stateEnteredAt",
  ];
  const sortParam = searchParams?.sort;
  const sortKey: SortKey = (
    sortParam && (validSortKeys as string[]).includes(sortParam)
      ? sortParam
      : "reportedAt"
  ) as SortKey;
  const dirParam = searchParams?.dir;
  const sortDir: "asc" | "desc" = dirParam === "asc" ? "asc" : "desc";

  const schoolFilter = searchParams?.school || undefined;
  const manufacturerFilter = searchParams?.manufacturer || undefined;
  const assigneeFilter = searchParams?.assignee || undefined;

  const where: Prisma.TicketWhereInput = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(schoolFilter ? { schoolId: schoolFilter } : {}),
    ...(assigneeFilter
      ? assigneeFilter === "unassigned"
        ? { assignedUserId: null }
        : { assignedUserId: assigneeFilter }
      : {}),
    ...(manufacturerFilter
      ? { device: { model: { manufacturer: manufacturerFilter } } }
      : {}),
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

  const [tickets, total, assignableUsers, templates, schoolsForPicker, manufacturers] =
    await Promise.all([
    prisma.ticket.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      orderBy: { [sortKey]: sortDir },
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
    canWrite
      ? prisma.ticketTemplate.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.school.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
      take: 500,
    }),
    prisma.deviceModel.findMany({
      distinct: ["manufacturer"],
      select: { manufacturer: true },
      orderBy: { manufacturer: "asc" },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allStates = Object.values(TicketState);
  const activeFilters: Record<string, string> = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(query ? { q: query } : {}),
    ...(schoolFilter ? { school: schoolFilter } : {}),
    ...(manufacturerFilter ? { manufacturer: manufacturerFilter } : {}),
    ...(assigneeFilter ? { assignee: assigneeFilter } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
  const returnTo = `/tickets?${new URLSearchParams(activeFilters).toString()}`;

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
              href="/bench?scope=all"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              All benches
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

      {canWrite && templates.length > 0 && (
        <form
          action={createTicketFromTemplateAction}
          className="mb-4 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/60 p-3 text-sm"
        >
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Quick-create from template
          </div>
          <select
            name="templateId"
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">— template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            name="schoolId"
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">— school —</option>
            {schoolsForPicker.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.code && `(${s.code})`}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="deviceSerial"
            placeholder="Device serial (optional)"
            className="w-40 rounded border border-surface-border bg-surface px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            Create ticket
          </button>
        </form>
      )}

      <form
        method="get"
        className="mb-5 space-y-3 rounded border border-surface-border bg-surface-muted/40 p-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Search
            </span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Incident or description"
              className="w-56 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
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
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              School
            </span>
            <select
              name="school"
              defaultValue={schoolFilter ?? ""}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">All schools</option>
              {schoolsForPicker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.code && `(${s.code})`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Manufacturer
            </span>
            <select
              name="manufacturer"
              defaultValue={manufacturerFilter ?? ""}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">All manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m.manufacturer} value={m.manufacturer}>
                  {m.manufacturer}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Assignee
            </span>
            <select
              name="assignee"
              defaultValue={assigneeFilter ?? ""}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1 text-sm font-semibold transition hover:bg-accent-strong"
          >
            Apply filters
          </button>
          {(query || stateFilter || schoolFilter || manufacturerFilter || assigneeFilter) && (
            <Link
              href="/tickets"
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear all filters
            </Link>
          )}
          <div className="ml-auto">
            <a
              href={`/api/exports/tickets?${new URLSearchParams({
                ...(stateFilter ? { state: stateFilter } : {}),
                ...(query ? { q: query } : {}),
                ...(schoolFilter ? { school: schoolFilter } : {}),
                ...(manufacturerFilter ? { manufacturer: manufacturerFilter } : {}),
              }).toString()}`}
              className="rounded border border-surface-border px-3 py-1 text-sm transition hover:border-accent"
              title="Download matching tickets as CSV"
            >
              Export CSV
            </a>
          </div>
        </div>
      </form>

      {canTransition && tickets.length > 0 && (
        <BulkActionForm
          tickets={tickets}
          assignableUsers={assignableUsers}
          returnTo={returnTo}
          sortKey={sortKey}
          sortDir={sortDir}
          baseQuery={{
            ...(stateFilter ? { state: stateFilter } : {}),
            ...(query ? { q: query } : {}),
          }}
        />
      )}

      {!canTransition && (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <TicketTable
            tickets={tickets}
            sortKey={sortKey}
            sortDir={sortDir}
            baseQuery={{
              ...(stateFilter ? { state: stateFilter } : {}),
              ...(query ? { q: query } : {}),
            }}
          />
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
  sortKey,
  sortDir,
  baseQuery,
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
  sortKey: string;
  sortDir: "asc" | "desc";
  baseQuery: Record<string, string>;
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

      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <TicketTable
          tickets={tickets}
          withCheckbox
          sortKey={sortKey}
          sortDir={sortDir}
          baseQuery={baseQuery}
        />
      </div>
    </form>
  );
}

function TicketTable({
  tickets,
  withCheckbox = false,
  sortKey,
  sortDir,
  baseQuery,
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
  sortKey: string;
  sortDir: "asc" | "desc";
  baseQuery: Record<string, string>;
}) {
  function sortHref(key: string): string {
    const sp = new URLSearchParams(baseQuery);
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    sp.set("sort", key);
    sp.set("dir", nextDir);
    sp.delete("page");
    return `/tickets?${sp.toString()}`;
  }
  function sortIndicator(key: string): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }
  return (
    <table className="min-w-full divide-y divide-surface-border text-sm">
      <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
        <tr>
          {withCheckbox && <th className="px-2 py-2" />}
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("incidentNumber")}
              className="hover:text-white"
              scroll={false}
            >
              Incident{sortIndicator("incidentNumber")}
            </Link>
          </th>
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("state")}
              className="hover:text-white"
              scroll={false}
            >
              State{sortIndicator("state")}
            </Link>
          </th>
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("stateEnteredAt")}
              className="hover:text-white"
              scroll={false}
            >
              SLA{sortIndicator("stateEnteredAt")}
            </Link>
          </th>
          <th className="px-3 py-2 font-medium">Assignee</th>
          <th className="px-3 py-2 font-medium">School</th>
          <th className="px-3 py-2 font-medium">Device</th>
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("reportedAt")}
              className="hover:text-white"
              scroll={false}
              title="Sort by report date"
            >
              Summary{sortIndicator("reportedAt")}
            </Link>
          </th>
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

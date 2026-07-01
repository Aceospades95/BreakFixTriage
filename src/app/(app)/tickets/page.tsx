import Link from "next/link";
import { TicketPriority, TicketState, type Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PriorityPill } from "@/components/priority-pill";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { ClickableRow } from "@/components/clickable-row";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { ALLOWED_TRANSITIONS } from "@/lib/workflow";
import { getSlaThresholds } from "@/lib/settings/settings";
import { slaBreachedWhere } from "@/lib/reports/sla-filter";
import { TicketsBulkActions } from "@/components/tickets-bulk-actions";
import {
  bulkAssignAction,
  bulkTransitionAction,
} from "@/server/actions/bulk";
import { createTicketFromTemplateAction } from "@/server/actions/templates";

export const dynamic = "force-dynamic";

// Round-22 (demo feedback, Jorge) — operators choose how many tickets
// render per page. 50 stays the default.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: {
    state?: string;
    q?: string;
    page?: string;
    perPage?: string;
    sort?: string;
    dir?: string;
    school?: string;
    manufacturer?: string;
    assignee?: string;
    slaHealth?: string;
    error?: string;
    ok?: string;
  };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canWrite = can(session.role, PERMISSIONS.TICKETS_WRITE);
  const canTransition = can(session.role, PERMISSIONS.TICKETS_TRANSITION);

  const stateParam = searchParams?.state;
  const validStates = Object.values(TicketState) as string[];
  // `state=open` is a virtual filter ("anything not closed") used by
  // the manager KPIs on the home page.
  const openOnly = stateParam === "open";
  const stateFilter =
    stateParam && validStates.includes(stateParam)
      ? (stateParam as TicketState)
      : undefined;
  // `slaHealth=breached` — same definition the SLA badges and the
  // home-page attention queue use: whole days in current state >= the
  // state's threshold. Expressed as a per-state stateEnteredAt cutoff
  // so the database does the filtering.
  const slaBreachedOnly = searchParams?.slaHealth === "breached";
  const query = searchParams?.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
  const perPageParsed = parseInt(searchParams?.perPage ?? "", 10);
  const perPage = (PAGE_SIZE_OPTIONS as readonly number[]).includes(
    perPageParsed,
  )
    ? perPageParsed
    : DEFAULT_PAGE_SIZE;

  // Sort parsing. The `sort` param is the column key; `dir` is asc|desc.
  // Limits sort keys to the ones with a real database column so
  // Prisma can execute the orderBy without a join.
  type SortKey =
    | "reportedAt"
    | "state"
    | "priority"
    | "incidentNumber"
    | "stateEnteredAt"
    | "shortDescription"
    | "schoolName"
    | "schoolCode";
  const validSortKeys: SortKey[] = [
    "reportedAt",
    "state",
    "priority",
    "incidentNumber",
    "stateEnteredAt",
    "shortDescription",
    // Round-20 — NY team: sort the Location column alphabetically
    // (school name) or numerically (DBN code).
    "schoolName",
    "schoolCode",
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

  // Shared with /api/exports/tickets so "what you see" and "what you
  // download" agree on the breached definition.
  const slaBreachedClause = slaBreachedOnly
    ? slaBreachedWhere(await getSlaThresholds())
    : null;

  const where: Prisma.TicketWhereInput = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(openOnly ? { state: { not: TicketState.CLOSED } } : {}),
    ...(slaBreachedClause ? { AND: [slaBreachedClause] } : {}),
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
      take: perPage,
      skip: (page - 1) * perPage,
      orderBy:
        sortKey === "schoolName"
          ? { school: { name: sortDir } }
          : sortKey === "schoolCode"
            ? { school: { code: sortDir } }
            : { [sortKey]: sortDir },
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

  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const allStates = Object.values(TicketState);
  const activeFilters: Record<string, string> = {
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(openOnly ? { state: "open" } : {}),
    ...(slaBreachedOnly ? { slaHealth: "breached" } : {}),
    ...(query ? { q: query } : {}),
    ...(schoolFilter ? { school: schoolFilter } : {}),
    ...(manufacturerFilter ? { manufacturer: manufacturerFilter } : {}),
    ...(assigneeFilter ? { assignee: assigneeFilter } : {}),
    ...(perPage !== DEFAULT_PAGE_SIZE ? { perPage: String(perPage) } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
  // Sort links rebuild the URL from this map — page resets to 1 on a
  // re-sort but every FILTER survives (pre-Round-22, sorting silently
  // dropped school/manufacturer/assignee/SLA filters).
  const sortBaseQuery: Record<string, string> = { ...activeFilters };
  delete sortBaseQuery.page;
  const activeQs = new URLSearchParams(activeFilters).toString();
  const returnTo = activeQs ? `/tickets?${activeQs}` : "/tickets";

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

      {/* When the list is filtered to a "ready" state, say what the
          next operational step is instead of leaving a dead end. */}
      {stateFilter &&
        ["AWAITING_PICKUP", "PENDING_DELIVERY", "AWAITING_ONSITE"].includes(
          stateFilter,
        ) &&
        total > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-accent/40 bg-accent/5 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1 text-slate-200">
              <span className="font-semibold">
                These tickets are ready to schedule.
              </span>{" "}
              Group them onto a route from the Scheduling page — they move
              to{" "}
              {stateFilter === "PENDING_DELIVERY"
                ? "Delivery scheduled"
                : "Pickup scheduled"}{" "}
              automatically when the route is built.
            </div>
            <Link
              href="/scheduling"
              className="shrink-0 rounded border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
            >
              Open Scheduling →
            </Link>
          </div>
        )}

      {canWrite && templates.length > 0 && (
        <form
          action={createTicketFromTemplateAction}
          data-testid="quick-create-form"
          className="mb-4 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/60 p-3 text-sm"
        >
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Quick-create from template
          </div>
          <select
            name="templateId"
            aria-label="Ticket template"
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
            aria-label="School"
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
            className="w-40 rounded border border-surface-border bg-surface px-2 py-1 font-medium tracking-tight text-xs focus:border-accent focus:outline-none"
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
              defaultValue={openOnly ? "open" : (stateFilter ?? "")}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">All states</option>
              <option value="open">All open (not closed)</option>
              {allStates.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              SLA
            </span>
            <select
              name="slaHealth"
              defaultValue={slaBreachedOnly ? "breached" : ""}
              title="Breached = days in the current state have reached that state's SLA threshold"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Any</option>
              <option value="breached">Breached only</option>
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
          {(query ||
            stateFilter ||
            openOnly ||
            slaBreachedOnly ||
            schoolFilter ||
            manufacturerFilter ||
            assigneeFilter) && (
            <Link
              href="/tickets"
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear all filters
            </Link>
          )}
          <div className="ml-auto flex items-center gap-3">
            {/* Round-22 (demo) — per-page picker: 10 / 25 / 50 / 100. */}
            <span className="flex items-center gap-1 text-xs text-slate-400">
              Show
              {PAGE_SIZE_OPTIONS.map((n) => {
                const sp = new URLSearchParams(activeFilters);
                sp.delete("page");
                if (n === DEFAULT_PAGE_SIZE) sp.delete("perPage");
                else sp.set("perPage", String(n));
                const qs = sp.toString();
                const active = n === perPage;
                return (
                  <Link
                    key={n}
                    href={`/tickets${qs ? `?${qs}` : ""}`}
                    aria-current={active ? "true" : undefined}
                    className={`rounded px-1.5 py-0.5 tabular-nums ${
                      active
                        ? "bg-accent/20 font-semibold text-accent"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {n}
                  </Link>
                );
              })}
              <span className="text-slate-500">per page</span>
            </span>
            <a
              href={(() => {
                // Every active filter, no paging — the download is
                // the full matching set, exactly what's on screen.
                const sp = new URLSearchParams(activeFilters);
                sp.delete("page");
                sp.delete("perPage");
                const qs = sp.toString();
                return `/api/exports/tickets${qs ? `?${qs}` : ""}`;
              })()}
              className="rounded border border-surface-border px-3 py-1 text-sm transition hover:border-accent"
              title="Download matching tickets as CSV"
            >
              Export CSV
            </a>
          </div>
        </div>
      </form>

      {canTransition && tickets.length > 0 && (
        <TicketsBulkActions
          returnTo={returnTo}
          bulkTransitionAction={bulkTransitionAction}
          bulkAssignAction={bulkAssignAction}
          assignableUsers={assignableUsers.map((u) => ({
            id: u.id,
            name: u.name,
          }))}
          transitionOptions={Object.values(TicketState).map((s) => ({
            value: s,
            label: humanise(s),
          }))}
          ticketStates={Object.fromEntries(
            tickets.map((t) => [t.id, t.state]),
          )}
          allowedTransitions={ALLOWED_TRANSITIONS}
        >
          <TicketTable
            tickets={tickets}
            withCheckbox
            sortKey={sortKey}
            sortDir={sortDir}
            baseQuery={sortBaseQuery}
          />
        </TicketsBulkActions>
      )}

      {!canTransition && (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <TicketTable
            tickets={tickets}
            sortKey={sortKey}
            sortDir={sortDir}
            baseQuery={sortBaseQuery}
          />
        </div>
      )}

      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} filters={activeFilters} />
      )}
    </>
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
    priority: TicketPriority;
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
              href={sortHref("priority")}
              className="hover:text-white"
              scroll={false}
              title="Sort by priority"
            >
              Priority{sortIndicator("priority")}
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
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("schoolName")}
              className="hover:text-white"
              scroll={false}
              title="Sort by school name (A–Z)"
            >
              School{sortIndicator("schoolName")}
            </Link>{" "}
            <Link
              href={sortHref("schoolCode")}
              className="text-[10px] text-slate-500 hover:text-white"
              scroll={false}
              title="Sort by DBN code (numeric)"
            >
              #{sortIndicator("schoolCode")}
            </Link>
          </th>
          <th className="px-3 py-2 font-medium">Device</th>
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("reportedAt")}
              className="hover:text-white"
              scroll={false}
              title="Sort by report date"
            >
              Reported{sortIndicator("reportedAt")}
            </Link>
          </th>
          <th className="px-3 py-2 font-medium">
            <Link
              href={sortHref("shortDescription")}
              className="hover:text-white"
              scroll={false}
              title="Sort by summary text"
            >
              Summary{sortIndicator("shortDescription")}
            </Link>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-border">
        {tickets.map((t) => (
          <ClickableRow
            key={t.id}
            href={`/tickets/${t.incidentNumber}`}
            className="transition hover:bg-surface-muted/40"
          >
            {withCheckbox && (
              <td className="p-0">
                {/* Round-22 §4 — fat, label-wrapped tap target (≥44px) so
                    field tablets can check a row without pixel-hunting. */}
                <label
                  className="flex h-11 w-full cursor-pointer items-center justify-center px-2"
                  aria-label={`Select ${t.incidentNumber}`}
                >
                  <input
                    type="checkbox"
                    name="ticketIds"
                    value={t.id}
                    className="h-4 w-4 accent-accent"
                  />
                </label>
              </td>
            )}
            <td className="px-3 py-2">
              <Link
                href={`/tickets/${t.incidentNumber}`}
                className="-my-2 inline-block py-2 font-medium tracking-tight text-accent hover:underline"
              >
                {t.incidentNumber}
              </Link>
              {/* Round-22 §4 — a SYN- ticket is a temporary one opened on
                  a route before its real incident is known; flag it so the
                  raw SYN- id doesn't look like a normal INC. */}
              {t.incidentNumber.startsWith("SYN-") && (
                <span
                  className="ml-1.5 rounded border border-violet-400/40 bg-violet-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-violet-200"
                  title="Temporary ticket opened on a route — link it to the real incident from Duplicates."
                >
                  temp
                </span>
              )}
            </td>
            <td className="px-3 py-2">
              <PriorityPill priority={t.priority} />
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
            <td className="px-3 py-2 font-medium tracking-tight text-xs text-slate-400">
              {t.device?.serialNumber ?? "—"}
            </td>
            <td className="px-3 py-2 text-xs text-slate-400">
              {t.reportedAt.toISOString().slice(0, 10)}
            </td>
            <td className="px-3 py-2 text-slate-300">
              <span className="line-clamp-1" title={t.shortDescription}>
                {t.shortDescription}
              </span>
            </td>
          </ClickableRow>
        ))}
        {tickets.length === 0 && (
          <tr>
            <td
              colSpan={withCheckbox ? 10 : 9}
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
  filters,
}: {
  page: number;
  pageCount: number;
  /** Every active filter param — paging must not silently drop any. */
  filters: Record<string, string>;
}) {
  const mkHref = (p: number) => {
    const sp = new URLSearchParams(filters);
    sp.delete("page");
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

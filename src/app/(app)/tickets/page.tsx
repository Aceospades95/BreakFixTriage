import Link from "next/link";
import { TicketState, type Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: {
    state?: string;
    q?: string;
    page?: string;
  };
}) {
  await requireRole(PERMISSIONS.TICKETS_READ);

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

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      orderBy: { reportedAt: "desc" },
      include: { school: true, device: true },
    }),
    prisma.ticket.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allStates = Object.values(TicketState);

  return (
    <>
      <PageHeader
        title="Tickets"
        subtitle={`${total.toLocaleString()} matching ticket${total === 1 ? "" : "s"}`}
      />

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
      </form>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Incident</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Reported</th>
              <th className="px-3 py-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {tickets.map((t) => (
              <tr
                key={t.id}
                className="transition hover:bg-surface-muted/40"
              >
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
                <td className="px-3 py-2">{t.school.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {t.device?.serialNumber ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {t.reportedAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  <span className="line-clamp-1">{t.shortDescription}</span>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No tickets match the current filters. Try clearing them or
                  run an import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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

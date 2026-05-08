import Link from "next/link";
import { QuoteStatus, type Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { formatCents, humanise } from "@/lib/format";
import { sweepQuotesAction } from "@/server/actions/quotes";

export const dynamic = "force-dynamic";

const STATUS_TABS: { label: string; value: QuoteStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: QuoteStatus.DRAFT },
  { label: "Sent", value: QuoteStatus.SENT },
  { label: "Approved", value: QuoteStatus.APPROVED },
  { label: "Declined", value: QuoteStatus.DECLINED },
  { label: "No response", value: QuoteStatus.NO_RESPONSE },
  { label: "Cancelled", value: QuoteStatus.CANCELLED },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams?: { status?: string; error?: string; ok?: string };
}) {
  const session = await requireRole(PERMISSIONS.QUOTES_READ);
  const canWrite = can(session.role, PERMISSIONS.QUOTES_WRITE);

  const filterParam = searchParams?.status;
  const filter: QuoteStatus | undefined =
    filterParam && (Object.values(QuoteStatus) as string[]).includes(filterParam)
      ? (filterParam as QuoteStatus)
      : undefined;

  const where: Prisma.QuoteWhereInput = filter ? { status: filter } : {};

  const [quotes, counts, expiringSoonCount] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        ticket: {
          include: {
            school: { select: { name: true, code: true } },
          },
        },
      },
    }),
    prisma.quote.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.quote.count({
      where: {
        status: { in: [QuoteStatus.SENT, QuoteStatus.APPROVED] },
        holdUntil: { lte: new Date() },
      },
    }),
  ]);

  const countByStatus = new Map<QuoteStatus, number>();
  for (const c of counts) {
    countByStatus.set(c.status, c._count._all);
  }

  return (
    <>
      <PageHeader
        title="Quotes"
        subtitle="Out-of-warranty repairs waiting on customer decisions."
        actions={
          <div className="flex items-center gap-2">
            <a
              href={`/api/exports/quotes${filter ? `?status=${filter}` : ""}`}
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              ⬇ Export CSV
            </a>
            {canWrite && (
              <form action={sweepQuotesAction}>
                <button
                  type="submit"
                  className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
                  title="Expire any SENT or APPROVED quote whose hold window has passed."
                >
                  Run hold-window sweep
                </button>
              </form>
            )}
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

      {expiringSoonCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span>
            <strong>{expiringSoonCount}</strong> sent or approved quote
            {expiringSoonCount === 1 ? "" : "s"} past their hold window.
          </span>
          {canWrite && (
            <form action={sweepQuotesAction}>
              <button
                type="submit"
                className="rounded bg-amber-500/30 px-3 py-1 text-xs font-semibold hover:bg-amber-500/50"
              >
                Sweep now
              </button>
            </form>
          )}
        </div>
      )}

      <nav className="mb-5 flex flex-wrap gap-2 text-xs">
        {STATUS_TABS.map((tab) => {
          const active =
            (filter === undefined && tab.value === "ALL") || filter === tab.value;
          const count =
            tab.value === "ALL"
              ? counts.reduce((a, c) => a + c._count._all, 0)
              : (countByStatus.get(tab.value) ?? 0);
          return (
            <Link
              key={tab.value}
              href={tab.value === "ALL" ? "/quotes" : `/quotes?status=${tab.value}`}
              className={`rounded border px-2.5 py-1 transition ${
                active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-surface-border bg-surface-muted text-slate-300 hover:border-accent"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 font-medium tracking-tight text-slate-500">{count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Hold until</th>
              <th className="px-3 py-2 font-medium">Ticket state</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {quotes.map((q) => {
              const holdExpired =
                (q.status === QuoteStatus.SENT ||
                  q.status === QuoteStatus.APPROVED) &&
                q.holdUntil != null &&
                q.holdUntil.getTime() <= Date.now();
              return (
                <tr
                  key={q.id}
                  className="transition hover:bg-surface-muted/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/tickets/${q.ticket.incidentNumber}`}
                      className="font-medium tracking-tight text-accent hover:underline"
                    >
                      {q.ticket.incidentNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {q.ticket.school.name}
                    {q.ticket.school.code && (
                      <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
                        {q.ticket.school.code}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <QuoteStatusPill status={q.status} />
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">
                    {q.amountCents != null
                      ? formatCents(q.amountCents)
                      : q.diagnosticOnly
                        ? "diagnostic"
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {q.holdUntil ? (
                      <span
                        className={
                          holdExpired ? "text-amber-300" : "text-slate-300"
                        }
                      >
                        {q.holdUntil.toISOString().slice(0, 10)}
                        {holdExpired && " (expired)"}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatePill state={q.ticket.state} />
                  </td>
                </tr>
              );
            })}
            {quotes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No quotes{filter ? ` in ${filter}` : ""} right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QuoteStatusPill({ status }: { status: QuoteStatus }) {
  const cls: Record<QuoteStatus, string> = {
    DRAFT: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    SENT: "bg-violet-500/20 text-violet-200 border-violet-500/40",
    APPROVED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    DECLINED: "bg-red-500/20 text-red-200 border-red-500/40",
    NO_RESPONSE: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    CANCELLED: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls[status]}`}
    >
      {humanise(status)}
    </span>
  );
}

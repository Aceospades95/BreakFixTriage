import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { LocalTime } from "@/components/local-time";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_CHIPS = ["queued", "sent", "failed", "bounced"] as const;

interface SearchParams {
  status?: string;
  ticketId?: string;
  page?: string;
}

/**
 * Round-3 §A1 — email log viewer.
 *
 * Read-only first cut: every EmailLog row with status pill,
 * recipient summary, link to the entity (ticket / route / quote).
 * Retry button + "View rendered" side panel ship in the §A
 * follow-up branch.
 */
export default async function EmailLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireRole(PERMISSIONS.EMAIL_WRITE);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
  const where: Prisma.EmailLogWhereInput = {};
  if (
    searchParams?.status &&
    (STATUS_CHIPS as readonly string[]).includes(searchParams.status)
  ) {
    where.status = searchParams.status as
      | "queued"
      | "sent"
      | "failed"
      | "bounced";
  }
  if (searchParams?.ticketId) {
    where.ticketId = searchParams.ticketId;
  }

  const [rows, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { template: { select: { key: true } } },
    }),
    prisma.emailLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: Partial<SearchParams>): string {
    const sp = new URLSearchParams();
    const merged: SearchParams = {
      ...(searchParams ?? {}),
      ...overrides,
    };
    if (merged.status) sp.set("status", merged.status);
    if (merged.ticketId) sp.set("ticketId", merged.ticketId);
    if (merged.page) sp.set("page", merged.page);
    const qs = sp.toString();
    return qs ? `/admin/email-log?${qs}` : "/admin/email-log";
  }

  return (
    <>
      <PageHeader
        title="Email log"
        subtitle={`${total.toLocaleString()} send${total === 1 ? "" : "s"} matching`}
        actions={
          <span
            className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
            title="Round-3 §A: retry + 'View rendered' ship in a follow-up branch"
          >
            Read-only preview
          </span>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <Link
          href="/admin/email-log"
          className={
            "rounded-full border px-2.5 py-0.5 transition " +
            (!searchParams?.status
              ? "border-accent bg-accent/10 text-white"
              : "border-surface-border text-slate-300 hover:border-accent")
          }
        >
          All
        </Link>
        {STATUS_CHIPS.map((s) => {
          const active = searchParams?.status === s;
          return (
            <Link
              key={s}
              href={buildHref({ status: s, page: undefined })}
              className={
                "rounded-full border px-2.5 py-0.5 capitalize transition " +
                (active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-surface-border text-slate-300 hover:border-accent")
              }
            >
              {s}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No emails match these filters.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const statusCls =
              r.status === "sent"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                : r.status === "queued"
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-100"
                  : "border-red-500/40 bg-red-500/15 text-red-100";
            return (
              <li
                key={r.id}
                className="rounded-lg border border-surface-border bg-surface-muted/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-400">
                    <LocalTime date={r.createdAt} mode="datetime" />
                  </span>
                  <span
                    className={
                      "rounded border px-2 py-0.5 text-[10px] capitalize " +
                      statusCls
                    }
                  >
                    {r.status}
                  </span>
                  <span className="text-slate-300">{r.template.key}</span>
                  {r.ticketId && (
                    <Link
                      href={`/tickets/${r.ticketId}`}
                      className="text-accent hover:underline"
                    >
                      ticket
                    </Link>
                  )}
                  {r.routeId && (
                    <Link
                      href={`/scheduling/routes/${r.routeId}`}
                      className="text-accent hover:underline"
                    >
                      route
                    </Link>
                  )}
                  <span className="ml-auto text-slate-500">
                    {r.to.length} recipient{r.to.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-200">
                  {r.subject}
                </div>
                {r.to.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    To: {r.to.join(", ")}
                    {r.cc.length > 0 && (
                      <>
                        {" · "}Cc: {r.cc.join(", ")}
                      </>
                    )}
                  </div>
                )}
                {r.error && (
                  <div className="mt-1 text-[11px] text-red-300">
                    {/* Operator-facing error text. The Round-2
                        translator strips Prisma stack tokens; if a
                        provider returns its own raw error string we
                        render it as-is. The forbidden-tokens scan
                        catches Prisma leakage. */}
                    Error: {r.error}
                  </div>
                )}
                {r.providerMessageId && (
                  <div className="mt-1 text-[10px] text-slate-500">
                    Message id: {r.providerMessageId}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-slate-500">
                  Status family: {humanise(r.status)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className="rounded border border-surface-border px-3 py-1 hover:border-accent"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="rounded border border-surface-border px-3 py-1 hover:border-accent"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { LocalTime } from "@/components/local-time";
import { EntityDiff } from "@/components/audit/EntityDiff";
import { formatAuditAction } from "@/lib/audit/format";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/**
 * Audit log viewer (canonical at /admin/audit; /audit aliases here).
 *
 * Round-3 §F16 redesign: cards instead of a table, default filter
 * Last-7-days, multi-select category chips above the list. The
 * EntityDiff + ActionChip helpers from Round-2 stay; the page
 * shape changes to fit a 24"-monitor admin browsing pattern
 * better than a 6-column table.
 */

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null as number | null },
] as const;

/**
 * Category chips. Each maps to one or more `entityType` values
 * (the column on AuditLog) that the chip represents. Multi-select
 * is OR-of-categories.
 */
const CATEGORY_CHIPS: { value: string; label: string; entityTypes: string[] }[] = [
  { value: "ticket", label: "Ticket", entityTypes: ["Ticket", "TicketEvent"] },
  { value: "route", label: "Route", entityTypes: ["Route", "RouteStop", "Job"] },
  { value: "settings", label: "Settings", entityTypes: ["AppSetting", "System"] },
  { value: "email", label: "Email", entityTypes: ["EmailLog", "EmailRule", "EmailTemplate"] },
  { value: "status", label: "Status", entityTypes: ["Status", "StatusConfig"] },
  { value: "user", label: "User", entityTypes: ["User", "Contact", "School", "District"] },
];

interface SearchParams {
  range?: string;
  cats?: string;
  actor?: string;
  entityId?: string;
  page?: string;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
  const rangeValue = searchParams?.range ?? "7d";
  const range =
    RANGE_OPTIONS.find((r) => r.value === rangeValue) ?? RANGE_OPTIONS[0];
  const selectedCats = (searchParams?.cats?.split(",") ?? []).filter(Boolean);
  const cats = CATEGORY_CHIPS.filter((c) => selectedCats.includes(c.value));

  const where: Prisma.AuditLogWhereInput = {};
  if (range.days != null) {
    where.createdAt = {
      gte: new Date(Date.now() - range.days * 24 * 60 * 60 * 1000),
    };
  }
  if (cats.length > 0) {
    where.entityType = {
      in: cats.flatMap((c) => c.entityTypes),
    };
  }
  if (searchParams?.entityId) {
    where.entityId = searchParams.entityId;
  }
  if (searchParams?.actor) {
    where.actor = {
      email: { contains: searchParams.actor, mode: "insensitive" },
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: Partial<SearchParams>): string {
    const next: SearchParams = {
      range: rangeValue,
      cats: selectedCats.join(","),
      ...(searchParams?.actor ? { actor: searchParams.actor } : {}),
      ...(searchParams?.entityId ? { entityId: searchParams.entityId } : {}),
      ...overrides,
    };
    const sp = new URLSearchParams();
    if (next.range && next.range !== "7d") sp.set("range", next.range);
    if (next.cats) sp.set("cats", next.cats);
    if (next.actor) sp.set("actor", next.actor);
    if (next.entityId) sp.set("entityId", next.entityId);
    if (next.page) sp.set("page", next.page);
    const qs = sp.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  function toggleCatHref(catValue: string): string {
    const set = new Set(selectedCats);
    if (set.has(catValue)) set.delete(catValue);
    else set.add(catValue);
    return buildHref({ cats: Array.from(set).join(","), page: undefined });
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"} matching · ${range.label}`}
        actions={
          <a
            href={`/api/exports/audit${
              cats.length > 0 || searchParams?.actor || searchParams?.entityId
                ? "?" +
                  new URLSearchParams({
                    ...(cats.length > 0
                      ? {
                          entityTypes: cats
                            .flatMap((c) => c.entityTypes)
                            .join(","),
                        }
                      : {}),
                    ...(searchParams?.actor
                      ? { actor: searchParams.actor }
                      : {}),
                    ...(searchParams?.entityId
                      ? { entityId: searchParams.entityId }
                      : {}),
                  }).toString()
                : ""
            }`}
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ⬇ Export CSV
          </a>
        }
      />

      {/* Range picker */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Range:</span>
        {RANGE_OPTIONS.map((r) => {
          const active = r.value === rangeValue;
          return (
            <Link
              key={r.value}
              href={buildHref({ range: r.value, page: undefined })}
              className={
                "rounded-full border px-2.5 py-0.5 transition " +
                (active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-surface-border text-slate-300 hover:border-accent")
              }
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {/* Category chips */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Filter:</span>
        {CATEGORY_CHIPS.map((c) => {
          const active = selectedCats.includes(c.value);
          return (
            <Link
              key={c.value}
              href={toggleCatHref(c.value)}
              className={
                "rounded-full border px-2.5 py-0.5 transition " +
                (active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                  : "border-surface-border text-slate-300 hover:border-accent")
              }
            >
              {c.label}
            </Link>
          );
        })}
        {(selectedCats.length > 0 ||
          searchParams?.actor ||
          searchParams?.entityId) && (
          <Link
            href="/admin/audit"
            className="ml-2 text-slate-500 hover:text-white"
          >
            clear all
          </Link>
        )}
      </div>

      {/* Optional secondary filter (actor / entityId text inputs).
          Kept simple — the chips above carry the common case. */}
      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-2 text-xs"
      >
        <input type="hidden" name="range" value={rangeValue} />
        {selectedCats.length > 0 && (
          <input type="hidden" name="cats" value={selectedCats.join(",")} />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wide text-slate-400">
            Actor email contains
          </span>
          <input
            type="text"
            name="actor"
            defaultValue={searchParams?.actor ?? ""}
            placeholder="alex@…"
            className="w-48 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wide text-slate-400">
            Entity id (cuid)
          </span>
          <input
            type="text"
            name="entityId"
            defaultValue={searchParams?.entityId ?? ""}
            className="w-64 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
        >
          Apply
        </button>
      </form>

      {/* Cards */}
      {logs.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          No audit entries match the current filters.
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => {
            const after = (log.after as Record<string, unknown> | null) ?? null;
            const reason =
              typeof after?.reason === "string" ? after.reason : null;
            const action = formatAuditAction(log.action);
            const chipClass =
              action.kind === "transition"
                ? action.forced
                  ? "bg-red-500/20 text-red-100 border-red-500/40"
                  : "bg-sky-500/20 text-sky-100 border-sky-500/40"
                : action.kind === "email"
                  ? action.phase === "queued"
                    ? "bg-violet-500/20 text-violet-100 border-violet-500/40"
                    : action.phase === "sent"
                      ? "bg-emerald-500/20 text-emerald-100 border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-100 border-amber-500/40"
                  : action.kind === "create" || action.kind === "update"
                    ? "bg-indigo-500/20 text-indigo-100 border-indigo-500/40"
                    : action.kind === "delete"
                      ? "bg-red-500/20 text-red-100 border-red-500/40"
                      : "bg-slate-500/20 text-slate-200 border-slate-500/40";
            return (
              <li
                key={log.id}
                className="rounded-lg border border-surface-border bg-surface-muted/40 px-4 py-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-400">
                    <LocalTime date={log.createdAt} mode="datetime" />
                  </span>
                  <span
                    className={
                      "inline-flex items-center rounded border px-2 py-0.5 text-[11px] " +
                      chipClass
                    }
                    title={log.action}
                  >
                    {action.label}
                  </span>
                  <span className="text-slate-500">on</span>
                  <span className="text-slate-200">
                    {humanise(log.entityType)}
                  </span>
                  <IdChip value={log.entityId} />
                  <span className="ml-auto text-slate-500">
                    by{" "}
                    {log.actor ? (
                      <span
                        className="text-slate-300"
                        title={log.actor.email}
                      >
                        {log.actor.name}
                      </span>
                    ) : (
                      <span className="text-slate-500">system</span>
                    )}
                  </span>
                </div>
                {reason && (
                  <div className="mb-2 text-sm text-slate-200">
                    <span className="text-[10px] tracking-wide text-slate-500">
                      Reason:
                    </span>{" "}
                    {reason}
                  </div>
                )}
                <details className="text-[11px] text-slate-400">
                  <summary className="cursor-pointer select-none text-[10px] tracking-wide text-slate-500 hover:text-slate-300">
                    Field diff
                  </summary>
                  <div className="mt-2">
                    <EntityDiff
                      entityType={log.entityType}
                      before={log.before}
                      after={log.after}
                    />
                  </div>
                </details>
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

/**
 * Inline cuid / id chip. Renders the value with a click-to-select
 * affordance via the title attribute (the brief asks for a copy
 * button — that needs a client component; this is the
 * non-interactive fallback that ships now and gets upgraded once
 * the IdChip client component lands in §F).
 */
function IdChip({ value }: { value: string }) {
  return (
    <span
      title={`${value}\n(click to select)`}
      className="inline-flex max-w-[12rem] items-center rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-slate-400"
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * Audit log viewer. Displays AuditLog rows with optional filtering
 * by entity type, entity id, actor email, and action. Read-only,
 * admin-only.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: {
    entityType?: string;
    entityId?: string;
    actor?: string;
    action?: string;
    page?: string;
  };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
  const where: {
    entityType?: string;
    entityId?: string;
    action?: { contains: string; mode: "insensitive" };
    actor?: { email: { contains: string; mode: "insensitive" } };
  } = {};
  if (searchParams?.entityType) where.entityType = searchParams.entityType;
  if (searchParams?.entityId) where.entityId = searchParams.entityId;
  if (searchParams?.action) {
    where.action = { contains: searchParams.action, mode: "insensitive" };
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

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}`}
        actions={
          <a
            href={`/api/exports/audit?${new URLSearchParams({
              ...(searchParams?.entityType
                ? { entityType: searchParams.entityType }
                : {}),
              ...(searchParams?.entityId
                ? { entityId: searchParams.entityId }
                : {}),
              ...(searchParams?.action ? { action: searchParams.action } : {}),
              ...(searchParams?.actor ? { actor: searchParams.actor } : {}),
            }).toString()}`}
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ⬇ Export CSV
          </a>
        }
      />

      <form
        method="get"
        className="mb-5 grid gap-3 rounded border border-surface-border bg-surface-muted/40 p-3 sm:grid-cols-5"
      >
        <FilterInput
          label="Entity type"
          name="entityType"
          defaultValue={searchParams?.entityType}
        />
        <FilterInput
          label="Entity id"
          name="entityId"
          defaultValue={searchParams?.entityId}
        />
        <FilterInput
          label="Action"
          name="action"
          defaultValue={searchParams?.action}
        />
        <FilterInput
          label="Actor email"
          name="actor"
          defaultValue={searchParams?.actor}
        />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1 text-sm font-semibold hover:bg-accent-strong"
          >
            Filter
          </button>
          {(searchParams?.entityType ||
            searchParams?.entityId ||
            searchParams?.action ||
            searchParams?.actor) && (
            <Link href="/audit" className="text-xs text-slate-400 hover:text-white">
              clear
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Before → After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {logs.map((log) => (
              <tr key={log.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                  {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-3 py-2 text-xs">
                  {log.actor ? (
                    <>
                      <div className="text-slate-200">{log.actor.name}</div>
                      <div className="font-mono text-slate-500">
                        {log.actor.email}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-500">system</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  <div>{log.entityType}</div>
                  <div className="text-slate-500">{log.entityId}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-300">
                  {log.action}
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-400">
                  {log.before != null || log.after != null ? (
                    <pre className="max-w-lg overflow-auto whitespace-pre-wrap font-mono">
                      {JSON.stringify(
                        { before: log.before ?? null, after: log.after ?? null },
                        null,
                        1,
                      )}
                    </pre>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No audit entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/audit?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="rounded border border-surface-border px-3 py-1 hover:border-accent"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/audit?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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

function FilterInput({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
      />
    </label>
  );
}

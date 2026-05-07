import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { LocalTime } from "@/components/local-time";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  TICKETS: "Tickets",
  SCHOOLS: "Schools",
  DEVICES: "Devices",
  USERS: "Users",
  PARTS: "Parts",
  // Round-7 §2B — sentence case per Round-3 humanise convention.
  DEVICE_MODELS: "Device models",
};

/**
 * Round-7 §2B — operator-facing source labels. The Source enum
 * carries technical wire-format slugs (`SN_CSV`, `MANUAL_CSV`); the
 * UI shows the friendly name. `ServiceNow CSV` chosen over `SN CSV`
 * — see docs/round-7-assumptions.md for the abbreviation policy.
 */
const SOURCE_LABELS: Record<string, string> = {
  SN_CSV: "ServiceNow CSV",
  MANUAL_CSV: "Manual CSV",
  SNOW_API: "ServiceNow API",
};

function humaniseImportSource(raw: string): string {
  return SOURCE_LABELS[raw] ?? raw.replace(/_/g, " ");
}

const STATUS_COLORS: Record<string, string> = {
  COMMITTED: "text-emerald-300",
  FAILED: "text-red-300",
  CANCELLED: "text-slate-500",
  COMMITTING: "text-amber-300",
  VALIDATING: "text-amber-300",
  PENDING: "text-slate-400",
  READY: "text-blue-300",
};

export default async function ImportsPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const session = await requireRole(PERMISSIONS.IMPORTS_READ);
  const canRun = can(session.role, PERMISSIONS.IMPORTS_RUN);
  const filterType = searchParams?.type;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { rows: true } },
    },
  };
  if (filterType) query.where = { type: filterType };
  const batches = (await prisma.importBatch.findMany(query)) as unknown as Array<{
    id: string;
    filename: string;
    source: string;
    status: string;
    stats: Record<string, number> | null;
    createdAt: Date;
    type?: string;
    uploadedBy: { name: string };
    _count: { rows: number };
  }>;

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="Import tickets, schools, devices, users, parts, and device models from CSV or XLSX files"
        actions={
          canRun && (
            <Link
              href="/imports/new"
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold transition hover:bg-accent-strong"
            >
              New import
            </Link>
          )
        }
      />

      {/* Type filter tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-surface-border bg-surface-muted/60 p-1">
        <Link
          href="/imports"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            !filterType
              ? "bg-accent text-white"
              : "text-slate-300 hover:bg-surface-border/40 hover:text-white"
          }`}
        >
          All
        </Link>
        {(["TICKETS", "SCHOOLS", "DEVICES", "USERS", "PARTS", "DEVICE_MODELS"] as const).map((t) => (
          <Link
            key={t}
            href={`/imports?type=${t}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filterType === t
                ? "bg-accent text-white"
                : "text-slate-300 hover:bg-surface-border/40 hover:text-white"
            }`}
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* Template downloads */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">Download templates:</span>
        <a
          href="/api/imports/templates?type=tickets"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Tickets CSV
        </a>
        <a
          href="/api/imports/templates?type=schools"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Schools CSV
        </a>
        <a
          href="/api/imports/templates?type=devices"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Devices CSV
        </a>
        <a
          href="/api/imports/templates?type=users"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Users CSV
        </a>
        <a
          href="/api/imports/templates?type=parts"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Parts CSV
        </a>
        <a
          href="/api/imports/templates?type=device_models"
          className="rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
        >
          Device Models CSV
        </a>
      </div>

      {/* Import history table */}
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {batches.map((b) => {
              const stats = b.stats ?? {};
              const outcome =
                stats.created !== undefined
                  ? `${stats.created ?? 0} created · ${stats.updated ?? 0} updated · ${stats.duplicates ?? 0} dupes · ${stats.rejected ?? 0} rejected`
                  : "—";
              const ago = formatTimeAgo(b.createdAt);
              return (
                <tr key={b.id} className="transition hover:bg-surface-muted/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/imports/${b.id}`}
                      className="text-accent hover:underline"
                    >
                      {b.filename}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center whitespace-nowrap rounded bg-surface-border px-1.5 py-0.5 text-[10px] tracking-wide">
                      {TYPE_LABELS[b.type ?? "TICKETS"] ?? b.type ?? "Tickets"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {humaniseImportSource(b.source)}
                  </td>
                  <td className={`px-3 py-2 text-xs ${STATUS_COLORS[b.status] ?? ""}`}>
                    {humanise(b.status)}
                  </td>
                  <td className="px-3 py-2">{b._count.rows}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {outcome}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    <div>
                      <LocalTime date={b.createdAt} mode="short" />
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {ago} · {b.uploadedBy.name}
                    </div>
                  </td>
                </tr>
              );
            })}
            {batches.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  {filterType
                    ? `No ${TYPE_LABELS[filterType]?.toLowerCase() ?? filterType} imports yet.`
                    : "No import batches yet. Click \"New import\" to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

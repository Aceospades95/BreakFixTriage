import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function ImportBatchPage({
  params,
}: {
  params: { batchId: string };
}) {
  await requireRole(PERMISSIONS.IMPORTS_READ);

  const batch = await prisma.importBatch.findUnique({
    where: { id: params.batchId },
    include: {
      uploadedBy: { select: { name: true, email: true } },
      rows: {
        orderBy: { rowNumber: "asc" },
        take: 500,
        include: { resultingTicket: { select: { id: true, incidentNumber: true, state: true } } },
      },
      conflicts: {
        include: {
          leftTicket: { select: { id: true, incidentNumber: true } },
          rightTicket: { select: { id: true, incidentNumber: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const stats = (batch.stats as Record<string, number> | null) ?? {};
  const badCount = batch.rows.filter(
    (r) => r.status === "INVALID" || r.status === "REJECTED",
  ).length;
  const dupCount = batch.rows.filter((r) => r.status === "DUPLICATE").length;

  return (
    <>
      <PageHeader
        title={batch.filename}
        subtitle={`${batch.source} · uploaded by ${batch.uploadedBy.name} · ${batch.createdAt.toISOString().slice(0, 16).replace("T", " ")}`}
        actions={
          <Link
            href="/imports"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← All imports
          </Link>
        }
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Parsed" value={stats.parsed ?? 0} />
        <Stat label="Invalid" value={stats.invalid ?? 0} tone="warn" />
        <Stat label="Created" value={stats.created ?? 0} tone="good" />
        <Stat label="Updated" value={stats.updated ?? 0} />
        <Stat label="Duplicates" value={stats.duplicates ?? 0} tone="warn" />
        <Stat label="Rejected" value={stats.rejected ?? 0} tone="bad" />
      </section>

      {batch.conflicts.length > 0 && (
        <section className="mb-6 rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="font-semibold text-amber-200">
            {batch.conflicts.length} duplicate{" "}
            {batch.conflicts.length === 1 ? "conflict" : "conflicts"} from
            this batch
          </div>
          <Link
            href="/duplicates"
            className="mt-1 inline-block text-xs text-amber-200 underline"
          >
            Resolve in the duplicate queue →
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Rows ({batch.rows.length}
          {batch.rows.length >= 500 ? ", showing first 500" : ""})
        </h2>
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Ticket</th>
                <th className="px-3 py-2 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {batch.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium tracking-tight text-xs">
                    {r.rowNumber}
                  </td>
                  <td className="px-3 py-2 font-medium tracking-tight text-xs">
                    <RowStatus status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    {r.resultingTicket ? (
                      <Link
                        href={`/tickets/${r.resultingTicket.id}`}
                        className="font-medium tracking-tight text-accent hover:underline"
                      >
                        {r.resultingTicket.incidentNumber}
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-300">
                    {r.errors.length > 0 ? r.errors.join("; ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(badCount > 0 || dupCount > 0) && (
          <p className="mt-3 text-xs text-slate-500">
            {badCount} invalid/rejected row{badCount === 1 ? "" : "s"} and{" "}
            {dupCount} duplicate{dupCount === 1 ? "" : "s"} need attention.
          </p>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : tone === "bad"
          ? "border-red-500/40 bg-red-500/10"
          : "border-surface-border bg-surface-muted";
  return (
    <div className={`rounded border p-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RowStatus({ status }: { status: string }) {
  const color =
    status === "CREATED" || status === "UPDATED"
      ? "text-emerald-300"
      : status === "INVALID" || status === "REJECTED"
        ? "text-red-300"
        : status === "DUPLICATE"
          ? "text-amber-300"
          : "text-slate-400";
  return <span className={color}>{status}</span>;
}

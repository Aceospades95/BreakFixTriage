import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const session = await requireRole(PERMISSIONS.IMPORTS_READ);
  const canRun = can(session.role, PERMISSIONS.IMPORTS_RUN);

  const batches = await prisma.importBatch.findMany({
    take: 30,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { rows: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="ServiceNow CSV / XLSX exports"
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

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {batches.map((b) => {
              const stats = (b.stats as Record<string, number> | null) ?? {};
              const outcome =
                stats.created !== undefined
                  ? `${stats.created ?? 0}/${stats.updated ?? 0}/${stats.duplicates ?? 0}/${stats.rejected ?? 0}`
                  : "—";
              return (
                <tr key={b.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/imports/${b.id}`}
                      className="text-accent hover:underline"
                    >
                      {b.filename}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{b.source}</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.status}</td>
                  <td className="px-3 py-2">{b._count.rows}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {outcome}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {b.createdAt.toISOString().slice(0, 10)} ·{" "}
                    {b.uploadedBy.name}
                  </td>
                </tr>
              );
            })}
            {batches.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No import batches yet. Click "New import" to upload a
                  ServiceNow export.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Outcome columns: created / updated / duplicates / rejected
      </p>
    </>
  );
}

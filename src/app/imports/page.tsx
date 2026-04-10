import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const batches = await prisma.importBatch.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true, _count: { select: { rows: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Imports</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Home
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        ServiceNow CSV/XLSX exports. Upload UI arrives in Phase 1. Until
        then, use the <code>runImport()</code> service from a script or test.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2">{b.filename}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.source}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.status}</td>
                <td className="px-3 py-2">{b._count.rows}</td>
                <td className="px-3 py-2">
                  {b.createdAt.toISOString().slice(0, 10)} by{" "}
                  {b.uploadedBy.name}
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No import batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

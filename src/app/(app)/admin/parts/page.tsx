import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AdminPartsPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const q = searchParams?.q?.trim() ?? "";
  const parts = await prisma.part.findMany({
    where: q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { usages: true, movements: true } } },
    take: 500,
  });

  const lowStock = parts.filter(
    (p) => p.active && p.reorderLevel > 0 && p.onHand <= p.reorderLevel,
  );

  return (
    <>
      <PageHeader
        title="Parts"
        subtitle={`${parts.length} shown · ${lowStock.length} at or below reorder level`}
        actions={
          <Link
            href="/admin/parts/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New part
          </Link>
        }
      />

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by SKU or name"
          className="w-80 rounded border border-surface-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
      </form>

      {lowStock.length > 0 && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <strong>{lowStock.length}</strong> part
          {lowStock.length === 1 ? " is" : "s are"} at or below the reorder
          level. Check the rows flagged in amber below.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">On hand</th>
              <th className="px-3 py-2 font-medium">Reorder at</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Movements</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {parts.map((p) => {
              const low =
                p.active && p.reorderLevel > 0 && p.onHand <= p.reorderLevel;
              return (
                <tr
                  key={p.id}
                  className={`transition hover:bg-surface-muted/40 ${low ? "bg-amber-500/5" : ""}`}
                >
                  <td className="px-3 py-2 font-medium tracking-tight">
                    <Link
                      href={`/admin/parts/${p.id}`}
                      className="text-accent hover:underline"
                    >
                      {p.sku}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 text-[10px] text-slate-500">
                        retired
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 font-medium tracking-tight ${low ? "text-amber-300" : ""}`}
                  >
                    {p.onHand}
                  </td>
                  <td className="px-3 py-2 font-medium tracking-tight text-xs text-slate-400">
                    {p.reorderLevel || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {p.location ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium tracking-tight text-xs">
                    {p.costCents != null
                      ? `$${(p.costCents / 100).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p._count.movements}
                  </td>
                </tr>
              );
            })}
            {parts.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  {q ? "No matches." : "No parts yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const q = searchParams?.q?.trim() ?? "";
  const devices = await prisma.device.findMany({
    where: q
      ? {
          OR: [
            { serialNumber: { contains: q, mode: "insensitive" } },
            { assetTag: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      model: true,
      school: { select: { name: true, code: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { serialNumber: "asc" },
    take: 500,
  });

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle={`${devices.length} shown`}
        actions={
          <Link
            href="/admin/devices/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New device
          </Link>
        }
      />

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search serial or asset tag"
          className="w-80 rounded border border-surface-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Asset tag</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">Tickets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {devices.map((d) => (
              <tr key={d.id} className="transition hover:bg-surface-muted/40">
                <td className="px-3 py-2 font-mono">
                  <Link
                    href={`/admin/devices/${d.id}`}
                    className="text-accent hover:underline"
                  >
                    {d.serialNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {d.assetTag ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.model
                    ? `${d.model.manufacturer} ${d.model.modelName}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {d.school?.name ?? "—"}
                </td>
                <td className="px-3 py-2">{d._count.tickets}</td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  {q ? "No matches." : "No devices yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

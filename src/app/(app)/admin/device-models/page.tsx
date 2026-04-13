import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AdminDeviceModelsPage() {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const models = await prisma.deviceModel.findMany({
    orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
    include: {
      _count: {
        select: { devices: true, parts: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Device models"
        subtitle={`${models.length} total · edit to add repair notes for the technician knowledge base`}
      />

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Manufacturer</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Form factor</th>
              <th className="px-3 py-2 font-medium">Warranty</th>
              <th className="px-3 py-2 font-medium">Devices</th>
              <th className="px-3 py-2 font-medium">Parts</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {models.map((m) => (
              <tr key={m.id} className="transition hover:bg-surface-muted/40">
                <td className="px-3 py-2">{m.manufacturer}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/device-models/${m.id}`}
                    className="text-accent hover:underline"
                  >
                    {m.modelName}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {m.formFactor}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {m.warrantyMonths != null ? `${m.warrantyMonths}mo` : "—"}
                </td>
                <td className="px-3 py-2">{m._count.devices}</td>
                <td className="px-3 py-2">{m._count.parts}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {m.repairNotes ? (
                    <span className="text-emerald-300">yes</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No device models yet. They're created automatically when
                  you import a ticket with manufacturer + model, or when
                  you add a device manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

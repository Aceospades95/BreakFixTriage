import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateDeviceModelAction } from "@/server/actions/admin";

export const dynamic = "force-dynamic";

/**
 * Device model edit page. The key feature here is the
 * `repairNotes` textarea — plain-text knowledge base that techs
 * see on the ticket detail when the ticket's device matches this
 * model. A few paragraphs of "EduBook 14: hinges crack after 18
 * months — check PART-HINGE before diagnosing as manufacturer
 * defect" can save a shop hours a week.
 */
export default async function EditDeviceModelPage({
  params,
  searchParams,
}: {
  params: { modelId: string };
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const model = await prisma.deviceModel.findUnique({
    where: { id: params.modelId },
    include: {
      parts: { where: { active: true }, orderBy: { name: "asc" } },
      _count: { select: { devices: true } },
    },
  });
  if (!model) notFound();

  return (
    <>
      <PageHeader
        title={`${model.manufacturer} ${model.modelName}`}
        subtitle={`${model.formFactor} · ${model._count.devices} device${model._count.devices === 1 ? "" : "s"} in service`}
        actions={
          <Link
            href="/admin/device-models"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Device models
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form
          action={updateDeviceModelAction}
          className="space-y-4 rounded-lg border border-surface-border bg-surface-muted p-5"
        >
          <input type="hidden" name="id" value={model.id} />
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
              Warranty months
            </label>
            <input
              type="number"
              name="warrantyMonths"
              defaultValue={model.warrantyMonths ?? ""}
              min={0}
              max={120}
              className="w-32 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
              Repair notes (knowledge base)
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Plain text visible to every tech on the ticket detail
              page whenever they're working on this model. Keep each
              tip short and actionable. Examples: common failure
              modes, parts that tend to need replacement together,
              recall advisories.
            </p>
            <textarea
              name="repairNotes"
              defaultValue={model.repairNotes ?? ""}
              rows={12}
              placeholder="Hinges crack after ~18 months — check PART-HINGE before concluding manufacturer defect.&#10;Keyboards go sticky when exposed to sticky drinks — clean with isopropyl before replacing."
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Save
          </button>
        </form>

        <aside className="rounded-lg border border-surface-border bg-surface-muted p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Compatible parts
          </h2>
          {model.parts.length === 0 ? (
            <p className="text-xs text-slate-400">
              No parts are marked compatible with this model yet. Add
              them from the{" "}
              <Link href="/admin/parts" className="text-accent hover:underline">
                parts page
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {model.parts.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <Link
                    href={`/admin/parts/${p.id}`}
                    className="text-accent hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="font-mono text-xs text-slate-400">
                    {p.sku}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { ActionForm } from "@/components/action-form";
import { sortBoroughs } from "@/lib/geo/boroughs";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createDistrictAction,
  updateDistrictAction,
} from "@/server/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminDistrictsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const districts = await prisma.district.findMany({
    include: {
      schools: { select: { id: true } },
      users: { select: { userId: true } },
    },
    orderBy: { name: "asc" },
  });
  // Existing borough values become datalist suggestions so operators
  // type "Bronx" consistently instead of inventing variants.
  const knownRegions = sortBoroughs([
    ...new Set(
      districts
        .map((d) => d.region?.trim())
        .filter((r): r is string => Boolean(r)),
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Districts"
        subtitle={`${districts.length} total`}
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <section className="mb-6 max-w-lg rounded-lg border border-surface-border bg-surface-muted p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Add district
        </h2>
        <form
          action={createDistrictAction}
          className="grid gap-3 sm:grid-cols-[1fr_120px_120px_auto]"
        >
          <input
            name="name"
            placeholder="e.g. Bronx"
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <input
            name="code"
            placeholder="e.g. BRONX"
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight uppercase focus:border-accent focus:outline-none"
          />
          <input
            name="region"
            placeholder="e.g. NYC"
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="min-w-[4rem] whitespace-nowrap rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            Add
          </button>
        </form>
      </section>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Region</th>
              <th className="px-3 py-2 font-medium">Schools</th>
              <th className="px-3 py-2 font-medium">Users</th>
              <th className="px-3 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <datalist id="borough-suggestions">
            {knownRegions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <tbody className="divide-y divide-surface-border">
            {districts.map((d) => (
              <tr key={d.id}>
                {/* Five-borough expansion — name and borough are
                    editable inline. Region is the borough every
                    filter reads, and it was previously write-once at
                    creation (and never set at all for districts the
                    school importer creates). */}
                <td className="px-3 py-2" colSpan={2}>
                  <ActionForm
                    action={updateDistrictAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="districtId" value={d.id} />
                    <input
                      type="text"
                      name="name"
                      defaultValue={d.name}
                      aria-label={`Name for ${d.code}`}
                      className="w-48 min-w-0 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    />
                    <span className="font-medium tracking-tight text-xs text-slate-400">
                      {d.code}
                    </span>
                    <input
                      type="text"
                      name="region"
                      defaultValue={d.region ?? ""}
                      list="borough-suggestions"
                      placeholder="Borough"
                      aria-label={`Borough for ${d.code}`}
                      className="w-32 min-w-0 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="text-[10px] text-accent hover:underline"
                    >
                      save
                    </button>
                  </ActionForm>
                </td>
                <td className="px-3 py-2">{d.schools.length}</td>
                <td className="px-3 py-2">{d.users.length}</td>
                <td className="px-3 py-2 text-xs">
                  {d.active ? "yes" : "no"}
                </td>
              </tr>
            ))}
            {districts.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No districts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

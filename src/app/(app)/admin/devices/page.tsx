import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Round-9 §2C — /admin/devices gets pagination + filter.
 *
 * Filter:
 *   - `q`     — fuzzy match on serial or asset tag.
 *   - `school` — district + school filter (school cuid).
 *   - `model`  — device model filter (model cuid).
 *
 * Pagination:
 *   - `page` — 1-indexed; PAGE_SIZE = 50.
 *   - Pagination controls only render when total > PAGE_SIZE.
 */
export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    school?: string;
    model?: string;
    page?: string;
  };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const q = searchParams?.q?.trim() ?? "";
  const schoolFilter = searchParams?.school?.trim() ?? "";
  const modelFilter = searchParams?.model?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);

  const where: Prisma.DeviceWhereInput = {};
  if (q) {
    where.OR = [
      { serialNumber: { contains: q, mode: "insensitive" } },
      { assetTag: { contains: q, mode: "insensitive" } },
    ];
  }
  // Five-borough expansion — accept a school id (legacy links) OR a
  // DBN / name fragment. A <select> of ~1,500 schools is unusable,
  // and capping it would hide most of them.
  if (schoolFilter) {
    if (/^c[a-z0-9]{20,}$/i.test(schoolFilter)) {
      where.ownerSchoolId = schoolFilter;
    } else {
      where.school = {
        OR: [
          { name: { contains: schoolFilter, mode: "insensitive" } },
          { code: { contains: schoolFilter, mode: "insensitive" } },
        ],
      };
    }
  }
  if (modelFilter) where.modelId = modelFilter;

  const [devices, total, schools, models] = await Promise.all([
    prisma.device.findMany({
      where,
      include: {
        model: true,
        school: { select: { id: true, name: true, code: true } },
        _count: { select: { tickets: true } },
      },
      orderBy: { serialNumber: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.device.count({ where }),
    // Datalist suggestions only — the filter matches on text, so
    // this cap can never make a school unreachable.
    prisma.school.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
      take: 300,
    }),
    prisma.deviceModel.findMany({
      orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
      select: { id: true, manufacturer: true, modelName: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: {
    page?: number;
    q?: string;
    school?: string;
    model?: string;
  }): string {
    const sp = new URLSearchParams();
    const next = {
      q,
      school: schoolFilter,
      model: modelFilter,
      page: page.toString(),
      ...overrides,
    };
    if (next.q) sp.set("q", String(next.q));
    if (next.school) sp.set("school", String(next.school));
    if (next.model) sp.set("model", String(next.model));
    if (next.page && next.page !== "1") sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/admin/devices?${qs}` : "/admin/devices";
  }

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle={`${total.toLocaleString()} total · showing ${devices.length}`}
        actions={
          <Link
            href="/admin/devices/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New device
          </Link>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Search
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Serial or asset tag"
            className="w-64 rounded border border-surface-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          School
          <input
            type="search"
            name="school"
            list="device-school-suggestions"
            defaultValue={schoolFilter}
            placeholder="DBN or name"
            className="w-56 rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <datalist id="device-school-suggestions">
            {schools.map((s) => (
              <option key={s.id} value={s.code ?? s.name}>
                {s.name}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Model
          <select
            name="model"
            defaultValue={modelFilter}
            className="w-64 rounded border border-surface-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Every model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.manufacturer} {m.modelName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
        >
          Apply
        </button>
        {(q || schoolFilter || modelFilter) && (
          <Link
            href="/admin/devices"
            className="text-xs text-slate-400 hover:text-white"
          >
            clear
          </Link>
        )}
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
                <td className="px-3 py-2 font-medium tracking-tight">
                  <Link
                    href={`/admin/devices/${d.id}`}
                    className="text-accent hover:underline"
                  >
                    {d.serialNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
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
                <td className="px-3 py-2">
                  {/* Round-9 §2C — TICKETS count click-through to
                      the filtered tickets list. */}
                  {d._count.tickets > 0 ? (
                    <Link
                      href={`/tickets?device=${d.id}`}
                      className="text-accent hover:underline"
                    >
                      {d._count.tickets}
                    </Link>
                  ) : (
                    <span className="text-slate-500">0</span>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  {q || schoolFilter || modelFilter
                    ? "No matches."
                    : "No devices yet."}
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
                href={buildHref({ page: page - 1 })}
                className="rounded border border-surface-border px-3 py-1 hover:border-accent"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={buildHref({ page: page + 1 })}
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

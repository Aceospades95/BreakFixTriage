import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { deviceHotspots } from "@/lib/reports/productivity";
import { prisma } from "@/lib/db/prisma";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { ticketWhereForBorough } from "@/lib/geo/boroughs";
import { boroughOptions, normalizeBorough } from "@/lib/geo/borough-options";

export const dynamic = "force-dynamic";

export default async function DeviceHotspotsPage({
  searchParams,
}: {
  searchParams?: { days?: string; threshold?: string; borough?: string };
}) {
  const session = await requireRole(PERMISSIONS.REPORTS_READ);
  // Five-borough expansion — REPORTS_READ is in the read-only set,
  // so this page is reachable by district-scoped roles.
  const boroughs = await boroughOptions(prisma, session);
  const borough = normalizeBorough(searchParams?.borough, boroughs);
  const scope = andTicketWhere(
    ticketWhereForSession(session),
    ticketWhereForBorough(borough),
  );

  const days = Math.max(
    7,
    Math.min(730, parseInt(searchParams?.days ?? "180", 10) || 180),
  );
  const threshold = Math.max(
    2,
    Math.min(20, parseInt(searchParams?.threshold ?? "3", 10) || 3),
  );

  const { rows: hotspots, total: hotspotTotal } = await deviceHotspots(
    days,
    threshold,
    prisma,
    new Date(),
    scope,
  );

  return (
    <>
      <PageHeader
        title="Device hotspots"
        subtitle={`${hotspotTotal.toLocaleString()} device${hotspotTotal === 1 ? "" : "s"} have been in the shop ${threshold}+ times in the last ${days} days${borough ? ` in ${borough}` : ""}${hotspotTotal > hotspots.length ? ` — showing the ${hotspots.length} worst` : ""}. Prime candidates for retire-or-repair decisions.`}
      />

      {/* One form, not two: a GET form replaces the whole query
          string, so a separate borough form would silently reset the
          window and threshold (and vice versa). */}
      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/40 p-3 text-xs"
      >
        {boroughs.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="uppercase tracking-wide text-slate-400">
              Borough
            </span>
            <select
              name="borough"
              defaultValue={borough ?? ""}
              className="rounded border border-surface-border bg-surface px-2 py-1 focus:border-accent focus:outline-none"
            >
              <option value="">All boroughs</option>
              {boroughs.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="uppercase tracking-wide text-slate-400">
            Window (days)
          </span>
          <input
            type="number"
            name="days"
            min={7}
            max={730}
            defaultValue={days}
            className="w-24 rounded border border-surface-border bg-surface px-2 py-1 focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="uppercase tracking-wide text-slate-400">
            Min tickets
          </span>
          <input
            type="number"
            name="threshold"
            min={2}
            max={20}
            defaultValue={threshold}
            className="w-20 rounded border border-surface-border bg-surface px-2 py-1 focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 font-semibold hover:bg-accent-strong"
        >
          Apply
        </button>
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
              <th className="px-3 py-2 font-medium">Last reported</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {hotspots.map((h) => (
              <tr
                key={h.deviceId}
                className="transition hover:bg-surface-muted/40"
              >
                <td className="px-3 py-2 font-medium tracking-tight">
                  <Link
                    href={`/admin/devices/${h.deviceId}`}
                    className="text-accent hover:underline"
                  >
                    {h.serialNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs text-slate-400">
                  {h.assetTag ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">{h.modelName ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {h.schoolName}
                </td>
                <td
                  className={`px-3 py-2 font-medium tracking-tight text-sm ${h.ticketCount >= threshold * 2 ? "text-red-300" : "text-amber-300"}`}
                >
                  {h.ticketCount}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {h.lastReportedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {hotspots.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No devices meet the threshold.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function AdminSchoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string; sort?: string; dir?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const query = searchParams?.q?.trim() ?? "";
  // Round-20 — NY team: location list sortable alphabetically
  // (name) or numerically (DBN code), both directions.
  const sort = searchParams?.sort === "code" ? "code" : "name";
  const dir: "asc" | "desc" = searchParams?.dir === "desc" ? "desc" : "asc";
  const schools = await prisma.school.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      district: { select: { name: true } },
      address: true,
      _count: { select: { contacts: true, devices: true, tickets: true } },
    },
    orderBy:
      sort === "code"
        ? [{ code: dir }, { name: "asc" }]
        : [{ name: dir }],
    take: 500,
  });
  const sortHref = (key: "name" | "code") => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    sp.set("sort", key);
    sp.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/admin/schools?${sp.toString()}`;
  };
  const indicator = (key: "name" | "code") =>
    sort === key ? (dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle={`${schools.length} shown`}
        actions={
          <Link
            href="/admin/schools/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            + New school
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="get">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name or code"
            className="w-80 rounded border border-surface-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
        </form>
        <span className="text-xs text-slate-400">Sort:</span>
        <Link
          href={sortHref("name")}
          className={`rounded border px-2 py-1 text-xs transition hover:border-accent ${sort === "name" ? "border-accent text-white" : "border-surface-border text-slate-300"}`}
        >
          Name A–Z{indicator("name")}
        </Link>
        <Link
          href={sortHref("code")}
          className={`rounded border px-2 py-1 text-xs transition hover:border-accent ${sort === "code" ? "border-accent text-white" : "border-surface-border text-slate-300"}`}
        >
          DBN code{indicator("code")}
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Contacts</th>
              <th className="px-3 py-2 font-medium">Devices</th>
              <th className="px-3 py-2 font-medium">Tickets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {schools.map((s) => (
              <tr key={s.id} className="transition hover:bg-surface-muted/40">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/schools/${s.id}`}
                    className="text-accent hover:underline"
                  >
                    {s.name}
                  </Link>
                  {s.address && (
                    <div className="text-xs text-slate-500">
                      {s.address.line1}, {s.address.city}, {s.address.state}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {s.district.name}
                </td>
                <td className="px-3 py-2 font-medium tracking-tight text-xs">{s.code ?? "—"}</td>
                <td className="px-3 py-2">{s._count.contacts}</td>
                <td className="px-3 py-2">{s._count.devices}</td>
                <td className="px-3 py-2">{s._count.tickets}</td>
              </tr>
            ))}
            {schools.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  {query ? "No matching schools." : "No schools yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

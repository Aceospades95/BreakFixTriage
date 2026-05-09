import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createSchoolAction } from "@/server/actions/admin";

export const dynamic = "force-dynamic";

export default async function NewSchoolPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const districts = await prisma.district.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="New school"
        actions={
          <Link
            href="/admin/schools"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Schools
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {districts.length === 0 ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Create a district first from{" "}
          <Link href="/admin/districts" className="underline">
            /admin/districts
          </Link>
          .
        </div>
      ) : (
        <form
          action={createSchoolAction}
          className="max-w-2xl space-y-4 rounded-lg border border-surface-border bg-surface-muted p-6"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="District" name="districtId" required>
              <select
                name="districtId"
                required
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="School code (DBN)" name="code">
              <input
                type="text"
                name="code"
                placeholder="e.g. 11X101"
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight uppercase focus:border-accent focus:outline-none"
              />
            </Field>
          </div>
          <Field label="Name" name="name" required>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. P.S. 101 Bronx"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Address line 1" name="line1" required>
            <input
              type="text"
              name="line1"
              required
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Address line 2" name="line2">
            <input
              type="text"
              name="line2"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-[1fr_80px_120px] gap-3">
            <Field label="City" name="city" required>
              <input
                type="text"
                name="city"
                required
                defaultValue="New York"
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </Field>
            <Field label="State" name="state" required>
              <input
                type="text"
                name="state"
                required
                defaultValue="NY"
                maxLength={2}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm uppercase focus:border-accent focus:outline-none"
              />
            </Field>
            <Field label="ZIP" name="postalCode" required>
              <input
                type="text"
                name="postalCode"
                required
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude (optional)" name="latitude">
              <input
                type="text"
                name="latitude"
                inputMode="decimal"
                placeholder="e.g. 40.8448"
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
              />
            </Field>
            <Field label="Longitude (optional)" name="longitude">
              <input
                type="text"
                name="longitude"
                inputMode="decimal"
                placeholder="e.g. -73.8648"
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Coordinates are optional but required for the Google Routes
            optimizer to include this school in auto-sequenced routes.
          </p>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Create school
          </button>
        </form>
      )}
    </>
  );
}

function Field({
  label,
  name: _name,
  required = false,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
        {label}
        {required && " *"}
      </label>
      {children}
    </div>
  );
}

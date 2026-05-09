import Link from "next/link";
import { FormFactor } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createDeviceAction } from "@/server/actions/admin";

export const dynamic = "force-dynamic";

export default async function NewDevicePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    take: 500,
  });

  return (
    <>
      <PageHeader
        title="New device"
        actions={
          <Link
            href="/admin/devices"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Devices
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <form
        action={createDeviceAction}
        className="max-w-xl space-y-4 rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <Field label="Serial number" required>
          <input
            type="text"
            name="serialNumber"
            required
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Asset tag">
          <input
            type="text"
            name="assetTag"
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturer">
            <input
              type="text"
              name="manufacturer"
              placeholder="e.g. Acme"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Model">
            <input
              type="text"
              name="modelName"
              placeholder="e.g. EduBook 14"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Form factor">
            <select
              name="formFactor"
              defaultValue={FormFactor.OTHER}
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {Object.values(FormFactor).map((ff) => (
                <option key={ff} value={ff}>
                  {ff}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warranty (months)">
            <input
              type="number"
              name="warrantyMonths"
              min={0}
              max={120}
              placeholder="e.g. 36"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Owner school">
          <select
            name="ownerSchoolId"
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">— none —</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.code ? `(${s.code})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
        >
          Create device
        </button>
      </form>
    </>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
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

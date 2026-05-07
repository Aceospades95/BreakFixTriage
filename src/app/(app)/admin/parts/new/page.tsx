import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createPartAction } from "@/server/actions/parts";

export const dynamic = "force-dynamic";

export default async function NewPartPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);
  const models = await prisma.deviceModel.findMany({
    orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="New part"
        subtitle="Add a part to the warehouse inventory."
        actions={
          <Link
            href="/admin/parts"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Parts
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <form
        action={createPartAction}
        className="max-w-2xl space-y-4 rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <div className="grid grid-cols-[180px_1fr] gap-3">
          <Field label="SKU" required>
            <input
              type="text"
              name="sku"
              required
              maxLength={50}
              placeholder="e.g. SCREEN-EB14"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight uppercase focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Name" required>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. 14-inch replacement screen"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            name="description"
            rows={2}
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Reorder level">
            <input
              type="number"
              name="reorderLevel"
              min={0}
              defaultValue={0}
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Unit cost ($)">
            <input
              type="text"
              name="costDollars"
              inputMode="decimal"
              placeholder="e.g. 89.00"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              name="location"
              placeholder="e.g. A3-shelf-2"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Compatible device models">
          <div className="max-h-48 space-y-1 overflow-auto rounded border border-surface-border bg-surface p-2">
            {models.length === 0 ? (
              <p className="text-xs text-slate-400">
                No device models registered yet.
              </p>
            ) : (
              models.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-xs text-slate-200"
                >
                  <input
                    type="checkbox"
                    name="modelIds"
                    value={m.id}
                    className="accent-accent"
                  />
                  {m.manufacturer} {m.modelName}
                </label>
              ))
            )}
          </div>
        </Field>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
        >
          Create part
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

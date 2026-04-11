import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createLoanerAction } from "@/server/actions/loaners";

export const dynamic = "force-dynamic";

export default async function NewLoanerPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  return (
    <>
      <PageHeader
        title="New loaner"
        subtitle="Add a device to the loaner pool."
        actions={
          <Link
            href="/admin/loaners"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Loaners
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <form
        action={createLoanerAction}
        className="max-w-xl space-y-4 rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <Field label="Serial number" required>
          <input
            type="text"
            name="serialNumber"
            required
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-mono focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Asset tag">
          <input
            type="text"
            name="assetTag"
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm font-mono focus:border-accent focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturer">
            <input
              type="text"
              name="manufacturer"
              placeholder="Acme"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Model">
            <input
              type="text"
              name="modelName"
              placeholder="EduBook 14"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </Field>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
        >
          Add to pool
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

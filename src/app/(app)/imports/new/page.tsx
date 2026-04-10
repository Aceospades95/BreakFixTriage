import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { uploadImportAction } from "@/server/actions/imports";

export const dynamic = "force-dynamic";

export default async function NewImportPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.IMPORTS_RUN);

  return (
    <>
      <PageHeader
        title="New import"
        subtitle="Upload a ServiceNow CSV or XLSX export. The importer maps common ServiceNow column names, validates every row, detects duplicates, and writes results to the database."
        actions={
          <Link
            href="/imports"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← All imports
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <form
        action={uploadImportAction}
        encType="multipart/form-data"
        className="max-w-xl rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            File
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,.xls"
            required
            className="mt-2 block w-full cursor-pointer rounded border border-surface-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:border-accent"
          />
        </label>

        <div className="mt-4 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">Accepted columns</p>
          <p className="mt-1">
            The importer recognizes many ServiceNow export header styles.
            Required fields: Incident Number, Short Description, DBN /
            School Code, Opened At. Optional: Serial Number, Asset Tag,
            Manufacturer, Model, Priority, Description, Requested For.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
          >
            Upload and import
          </button>
          <span className="text-xs text-slate-500">
            Existing tickets are updated; new ones are created; conflicts go
            to the duplicate queue.
          </span>
        </div>
      </form>
    </>
  );
}

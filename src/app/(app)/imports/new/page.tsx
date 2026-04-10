import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  runServiceNowSyncAction,
  uploadImportAction,
} from "@/server/actions/imports";
import { isServiceNowConfigured } from "@/lib/import/servicenow";

export const dynamic = "force-dynamic";

export default async function NewImportPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireRole(PERMISSIONS.IMPORTS_RUN);
  const snConfigured = isServiceNowConfigured();

  return (
    <>
      <PageHeader
        title="New import"
        subtitle="Upload a ServiceNow CSV or XLSX export, or pull directly from the ServiceNow Table API."
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

      <section className="mb-6 max-w-xl rounded-lg border border-surface-border bg-surface-muted p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Pull from ServiceNow
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Calls the ServiceNow Table API and feeds the results through the
          normal import pipeline. Uses{" "}
          <code className="font-mono">SERVICENOW_BASE_URL</code>,{" "}
          <code className="font-mono">SERVICENOW_USERNAME</code>, and{" "}
          <code className="font-mono">SERVICENOW_PASSWORD</code> from the
          environment.
        </p>
        <div className="mt-4">
          {snConfigured ? (
            <form action={runServiceNowSyncAction}>
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
              >
                Sync from ServiceNow
              </button>
            </form>
          ) : (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              ServiceNow is not configured for this deployment. Set the
              three env vars above and redeploy to enable the sync button.
            </p>
          )}
        </div>
      </section>

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

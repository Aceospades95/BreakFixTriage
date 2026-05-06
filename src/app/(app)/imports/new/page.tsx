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

const IMPORT_TYPES = [
  {
    value: "tickets",
    label: "Tickets (ServiceNow)",
    description: "Import incident tickets from a ServiceNow CSV/XLSX export. Creates tickets, resolves schools by code, and creates device records.",
    requiredFields: "Incident Number, Short Description, School Code, Opened At",
    optionalFields: "Serial Number, Asset Tag, Manufacturer, Model, Priority, Description, Requested For",
    templateUrl: "/api/imports/templates?type=tickets",
  },
  {
    value: "schools",
    label: "Schools",
    description: "Import school records. Creates districts automatically if they don't exist. Updates existing schools matched by code.",
    requiredFields: "Name, Code, District Name",
    optionalFields: "Address, City, State, Zip, Phone, Contact Name, Contact Email",
    templateUrl: "/api/imports/templates?type=schools",
  },
  {
    value: "devices",
    label: "Devices",
    description: "Import device inventory. Schools must exist before importing devices (import schools first). Creates device models automatically.",
    requiredFields: "Serial Number, School Code",
    optionalFields: "Asset Tag, Manufacturer, Model, Warranty End, Notes",
    templateUrl: "/api/imports/templates?type=devices",
  },
  {
    value: "users",
    label: "Users",
    description: "Import user accounts. Existing users matched by email are updated. New users get a random password if none is provided.",
    requiredFields: "Name, Email",
    optionalFields: "Role, Password",
    templateUrl: "/api/imports/templates?type=users",
  },
  {
    value: "parts",
    label: "Parts",
    description: "Import parts inventory. Existing parts matched by SKU are updated. Creates device models automatically if manufacturer and model are provided.",
    requiredFields: "SKU, Name",
    optionalFields: "Cost, Stock Qty, Min Stock Qty, Manufacturer, Model, Notes",
    templateUrl: "/api/imports/templates?type=parts",
  },
  {
    value: "device_models",
    label: "Device Models",
    description: "Import device model catalog. Existing models matched by manufacturer + model name are updated.",
    requiredFields: "Manufacturer, Model Name",
    optionalFields: "Form Factor, Warranty Months, Repair Notes",
    templateUrl: "/api/imports/templates?type=device_models",
  },
] as const;

export default async function NewImportPage({
  searchParams,
}: {
  searchParams?: { error?: string; type?: string };
}) {
  await requireRole(PERMISSIONS.IMPORTS_RUN);
  const snConfigured = isServiceNowConfigured();
  const selectedType = searchParams?.type ?? "tickets";
  const typeConfig = IMPORT_TYPES.find((t) => t.value === selectedType) ?? IMPORT_TYPES[0];

  return (
    <>
      <PageHeader
        title="New import"
        subtitle="Upload a CSV or XLSX file to import data into the system."
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

      {/* Import type selector */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border border-surface-border bg-surface-muted/60 p-1">
        {IMPORT_TYPES.map((t) => (
          <Link
            key={t.value}
            href={`/imports/new?type=${t.value}`}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              selectedType === t.value
                ? "bg-accent text-white"
                : "text-slate-300 hover:bg-surface-border/40 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ServiceNow sync (only for tickets) */}
      {selectedType === "tickets" && (
        <section className="mb-6 max-w-2xl rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Pull from ServiceNow
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Calls the ServiceNow Table API and feeds the results through the
            normal import pipeline. Uses{" "}
            <code className="font-medium tracking-tight">SERVICENOW_BASE_URL</code>,{" "}
            <code className="font-medium tracking-tight">SERVICENOW_USERNAME</code>, and{" "}
            <code className="font-medium tracking-tight">SERVICENOW_PASSWORD</code> from the
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
      )}

      {/* File upload form */}
      <form
        action={uploadImportAction}
        encType="multipart/form-data"
        className="max-w-2xl rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <input type="hidden" name="importType" value={selectedType} />

        <div className="mb-4 rounded border border-surface-border/50 bg-surface/50 p-4">
          <div className="text-sm font-semibold text-slate-200">
            {typeConfig.label}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {typeConfig.description}
          </p>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-300">Required: </span>
              <span className="text-slate-400">{typeConfig.requiredFields}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-300">Optional: </span>
              <span className="text-slate-400">{typeConfig.optionalFields}</span>
            </div>
          </div>
          <div className="mt-3">
            <a
              href={typeConfig.templateUrl}
              className="inline-flex items-center gap-1.5 rounded border border-surface-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent hover:text-white"
            >
              <span>↓</span> Download sample CSV
            </a>
          </div>
        </div>

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

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
          >
            Upload and import
          </button>
          <span className="text-xs text-slate-500">
            {selectedType === "tickets"
              ? "Existing tickets are updated; new ones are created; conflicts go to the duplicate queue."
              : selectedType === "schools"
                ? "Existing schools are updated by code; new schools and districts are created."
                : selectedType === "devices"
                  ? "Existing devices are updated by serial number; new devices are created. Schools must exist."
                  : selectedType === "users"
                    ? "Existing users are updated by email; new users are created with a random password if none provided."
                    : selectedType === "parts"
                      ? "Existing parts are updated by SKU; new parts are created."
                      : "Existing device models are updated by manufacturer + model name; new ones are created."}
          </span>
        </div>
      </form>
    </>
  );
}

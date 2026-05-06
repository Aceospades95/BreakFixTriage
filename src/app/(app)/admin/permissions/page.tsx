import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { humanise } from "@/lib/format";
import {
  PERMISSIONS,
  type Permission,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
} from "@/lib/auth/rbac";
import {
  loadPermissionOverrides,
  savePermissionsAction,
  resetPermissionsAction,
} from "@/server/actions/permissions";

export const dynamic = "force-dynamic";

const ALL_PERMISSIONS = Object.entries(PERMISSIONS) as [string, Permission][];

const EDITABLE_ROLES: { role: Role; label: string }[] = [
  { role: "OPS_MANAGER", label: "Ops Manager" },
  { role: "DISPATCHER", label: "Dispatcher" },
  { role: "WAREHOUSE", label: "Warehouse" },
  { role: "TECHNICIAN", label: "Technician" },
  { role: "DRIVER", label: "Driver" },
  { role: "READ_ONLY", label: "Read Only" },
];

const PERM_GROUPS: { group: string; perms: [string, Permission][] }[] = [
  {
    group: "Tickets",
    perms: ALL_PERMISSIONS.filter(([, p]) => p.startsWith("tickets:")),
  },
  {
    group: "Imports",
    perms: ALL_PERMISSIONS.filter(([, p]) => p.startsWith("imports:")),
  },
  {
    group: "Scheduling & Routes",
    perms: ALL_PERMISSIONS.filter(
      ([, p]) =>
        p.startsWith("scheduling:") ||
        p.startsWith("routes:") ||
        p.startsWith("stops:"),
    ),
  },
  {
    group: "Quotes & Duplicates",
    perms: ALL_PERMISSIONS.filter(
      ([, p]) => p.startsWith("quotes:") || p.startsWith("duplicates:"),
    ),
  },
  {
    group: "Admin",
    perms: ALL_PERMISSIONS.filter(
      ([, p]) =>
        p.startsWith("users:") ||
        p.startsWith("districts:") ||
        p.startsWith("reports:"),
    ),
  },
];

function permLabel(key: string): string {
  // Round-4 §pre-work-2: humanise() canonical surface. The
  // permission constants are uppercase TOKENS like
  // `TICKETS_TRANSITION` — humanise turns them into "Tickets
  // transition" (titlecase + acronym preservation).
  return humanise(key);
}

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams?: { saved?: string; reset?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);
  // Ensure overrides are loaded from DB
  await loadPermissionOverrides();

  // Build the current effective permissions grid
  const grid: Record<string, Set<Permission>> = {};
  const defaults: Record<string, Set<Permission>> = {};
  for (const { role } of EDITABLE_ROLES) {
    grid[role] = new Set(getEffectivePermissions(role));
    defaults[role] = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
  }

  return (
    <>
      <PageHeader
        title="Role Permissions"
        subtitle="Customize what each role can do. Admin always has all permissions."
      />

      {searchParams?.saved && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Permissions saved successfully.
        </div>
      )}
      {searchParams?.reset && (
        <div className="mb-4 rounded border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          Permissions reset to defaults.
        </div>
      )}

      <form action={savePermissionsAction}>
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  Permission
                </th>
                {EDITABLE_ROLES.map(({ role, label }) => (
                  <th
                    key={role}
                    className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {PERM_GROUPS.map(({ group, perms }) => (
                <>
                  <tr key={`group-${group}`}>
                    <td
                      colSpan={EDITABLE_ROLES.length + 1}
                      className="bg-surface-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {group}
                    </td>
                  </tr>
                  {perms.map(([key, perm]) => (
                    <tr
                      key={perm}
                      className="transition hover:bg-surface-muted/30"
                    >
                      <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                        <div className="text-sm text-slate-200">
                          {permLabel(key)}
                        </div>
                        {/* Round-4 §G9: permission slug rendered as
                            an identifier — `<code>` is the only
                            place font-mono is allowed (§G14 lint). */}
                        <code className="text-[10px] text-slate-500">
                          {perm}
                        </code>
                      </td>
                      {EDITABLE_ROLES.map(({ role }) => {
                        const checked = grid[role]!.has(perm);
                        const isDefault = defaults[role]!.has(perm);
                        const modified = checked !== isDefault;
                        return (
                          <td key={role} className="px-3 py-2 text-center">
                            <label className="inline-flex items-center justify-center">
                              <input
                                type="checkbox"
                                name={`${role}__${perm}`}
                                defaultChecked={checked}
                                className="h-4 w-4 accent-accent"
                              />
                              {modified && (
                                <span className="ml-1 text-[10px] text-amber-400">*</span>
                              )}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
          >
            Save permissions
          </button>
          <span className="text-xs text-slate-500">
            * indicates a change from defaults
          </span>
        </div>
      </form>

      <form action={resetPermissionsAction} className="mt-4">
        <button
          type="submit"
          className="rounded border border-surface-border px-3 py-1.5 text-xs text-slate-400 transition hover:border-amber-500 hover:text-amber-200"
        >
          Reset all to defaults
        </button>
      </form>
    </>
  );
}

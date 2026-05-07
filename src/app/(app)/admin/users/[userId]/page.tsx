import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  resetUserPasswordAction,
  updateUserAction,
} from "@/server/actions/admin";
import { adminResetTotpAction } from "@/server/actions/2fa";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams?: { error?: string; ok?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const [user, districts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      include: { districts: true },
    }),
    prisma.district.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  const userDistrictIds = new Set(user.districts.map((du) => du.districtId));

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={user.email}
        actions={
          <Link
            href="/admin/users"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Users
          </Link>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Profile
          </h2>
          <form action={updateUserAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                Name
              </label>
              <input
                type="text"
                name="name"
                defaultValue={user.name}
                required
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                Role
              </label>
              <select
                name="role"
                defaultValue={user.role}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {humanise(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                Status
              </label>
              <select
                name="active"
                defaultValue={String(user.active)}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                Districts
              </label>
              <div className="space-y-1 rounded border border-surface-border bg-surface p-2">
                {districts.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 text-sm text-slate-200"
                  >
                    <input
                      type="checkbox"
                      name="districtIds"
                      value={d.id}
                      defaultChecked={userDistrictIds.has(d.id)}
                      className="accent-accent"
                    />
                    {d.name}{" "}
                    <span className="font-medium tracking-tight text-xs text-slate-500">
                      {d.code}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
            >
              Save changes
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Reset password
          </h2>
          <form action={resetUserPasswordAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                New password
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              Set new password
            </button>
          </form>
        </section>
      </div>

      <section className="mt-6 max-w-2xl rounded-lg border border-surface-border bg-surface-muted p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Two-factor authentication
        </h2>
        {user.totpEnabledAt ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-medium tracking-tight text-[10px] uppercase text-emerald-200">
                enabled
              </span>{" "}
              on {user.totpEnabledAt.toISOString().slice(0, 10)}
            </p>
            <p className="text-xs text-slate-400">
              Use the button below only as an emergency reset — e.g. the
              user lost their phone and exhausted their recovery codes.
              This action is audit-logged.
            </p>
            <form action={adminResetTotpAction}>
              <input type="hidden" name="userId" value={user.id} />
              <ConfirmButton message="Reset this user's 2FA? They'll be able to sign in with just their password until they re-enroll.">
                Reset 2FA
              </ConfirmButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Not enrolled. The user can enroll from their own profile
            page.
          </p>
        )}
      </section>
    </>
  );
}

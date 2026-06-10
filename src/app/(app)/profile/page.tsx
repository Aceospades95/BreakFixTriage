import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { changeOwnPasswordAction } from "@/server/actions/admin";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { districts: { include: { district: true } } },
  });

  return (
    <>
      <PageHeader
        title="Your profile"
        subtitle="Change your password and review your role assignment."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/me/expenses"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              My expenses
            </Link>
            <Link
              href="/me/schedule"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              My schedule
            </Link>
            <Link
              href="/me/preferences"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Preferences →
            </Link>
          </div>
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
            Details
          </h2>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-slate-400">Name</dt>
            <dd>{session.name}</dd>
            <dt className="text-slate-400">Email</dt>
            <dd className="font-medium tracking-tight text-xs">{session.email}</dd>
            <dt className="text-slate-400">Role</dt>
            <dd>
              <span className="inline-flex items-center whitespace-nowrap rounded bg-surface-border px-2 py-0.5 text-[10px] font-medium tracking-wide">
                {humanise(session.role)}
              </span>
            </dd>
            <dt className="text-slate-400">Districts</dt>
            <dd>
              {user?.districts.length === 0 ? (
                <span className="text-xs text-slate-500">None assigned</span>
              ) : (
                user?.districts
                  .map((du) => du.district.name)
                  .join(", ")
              )}
            </dd>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            To change your name, email, role, or district membership,
            contact an administrator.
          </p>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Change password
          </h2>
          {!user?.passwordHash ? (
            <p className="text-sm text-slate-400">
              Your account signs in via SSO, so there is no password to
              change here.
            </p>
          ) : (
            <form action={changeOwnPasswordAction} className="space-y-4">
              <Field label="Current password" name="currentPassword" />
              <Field label="New password" name="newPassword" minLength={8} />
              <Field
                label="Confirm new password"
                name="confirmPassword"
                minLength={8}
              />
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
              >
                Update password
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-surface-border pt-4">
            <Link
              href="/profile/2fa"
              className="inline-flex items-center gap-2 rounded border border-surface-border px-3 py-2 text-sm transition hover:border-accent"
            >
              Manage two-factor authentication →
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  name,
  minLength,
}: {
  label: string;
  name: string;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={`pw-${name}`}
        className="mb-1 block text-xs uppercase tracking-wide text-slate-400"
      >
        {label}
      </label>
      <input
        id={`pw-${name}`}
        type="password"
        name={name}
        required
        minLength={minLength}
        className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

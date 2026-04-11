import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createUserAction } from "@/server/actions/admin";
import {
  decodePreservedForm,
  preserved,
} from "@/lib/forms/preserve";

export const dynamic = "force-dynamic";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams?: { error?: string; form?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);
  const districts = await prisma.district.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const values = decodePreservedForm(searchParams?.form);
  const selectedDistrictIds = new Set<string>(
    Array.isArray(values.districtIds)
      ? values.districtIds
      : typeof values.districtIds === "string"
        ? [values.districtIds]
        : [],
  );

  return (
    <>
      <PageHeader
        title="New user"
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

      <form
        action={createUserAction}
        className="max-w-xl space-y-4 rounded-lg border border-surface-border bg-surface-muted p-6"
      >
        <Field
          label="Full name"
          name="name"
          required
          defaultValue={preserved(values, "name")}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          defaultValue={preserved(values, "email")}
        />
        <Field
          label="Temporary password"
          name="password"
          type="password"
          required
          minLength={8}
          hint="User can change it from /profile after first sign-in."
        />
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
            Role
          </label>
          <select
            name="role"
            required
            defaultValue={preserved(values, "role", Role.READ_ONLY)}
            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
            Districts
          </label>
          <div className="space-y-1 rounded border border-surface-border bg-surface p-2">
            {districts.length === 0 ? (
              <p className="text-xs text-slate-400">
                No districts yet.{" "}
                <Link
                  href="/admin/districts"
                  className="text-accent hover:underline"
                >
                  Create one
                </Link>{" "}
                first.
              </p>
            ) : (
              districts.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-2 text-sm text-slate-200"
                >
                  <input
                    type="checkbox"
                    name="districtIds"
                    value={d.id}
                    defaultChecked={selectedDistrictIds.has(d.id)}
                    className="accent-accent"
                  />
                  {d.name}{" "}
                  <span className="font-mono text-xs text-slate-500">
                    {d.code}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
        >
          Create user
        </button>
      </form>
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  minLength,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

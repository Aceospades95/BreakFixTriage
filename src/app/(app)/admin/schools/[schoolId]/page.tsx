import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createContactAction,
  setMainContactAction,
  updateSchoolAction,
} from "@/server/actions/admin";
import {
  createPortalTokenAction,
  regeneratePortalTokenAction,
  revokePortalTokenAction,
} from "@/server/actions/portal";
import { CopyButton } from "@/components/copy-button";
import { appBaseUrl } from "@/lib/email/variables";

export const dynamic = "force-dynamic";

export default async function SchoolProfilePage({
  params,
  searchParams,
}: {
  params: { schoolId: string };
  searchParams?: { error?: string; ok?: string; newToken?: string };
}) {
  await requireRole(PERMISSIONS.DISTRICTS_MANAGE);

  const school = await prisma.school.findUnique({
    where: { id: params.schoolId },
    include: {
      district: true,
      address: true,
      mainContact: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      devices: {
        include: { model: true },
        orderBy: { serialNumber: "asc" },
        take: 100,
      },
      tickets: {
        orderBy: { reportedAt: "desc" },
        take: 25,
        include: { device: true },
      },
      portalTokens: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { devices: true, tickets: true } },
    },
  });
  if (!school) notFound();

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={`${school.district.name}${school.code ? ` · ${school.code}` : ""}`}
        actions={
          <Link
            href="/admin/schools"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Schools
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
      {searchParams?.newToken && (
        <div
          data-testid="portal-token-once"
          className="mb-4 space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
        >
          <h3 className="text-sm font-semibold">
            Copy this link now — you won&apos;t see it again
          </h3>
          <p className="text-xs text-amber-200/80">
            This is the only time the full URL is shown. If you lose
            it, use the Regenerate button on the token row below to
            issue a fresh link (the old one stops working).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-auto whitespace-nowrap rounded bg-amber-950/40 px-2 py-1.5 font-medium tracking-tight text-xs text-amber-100">
              {`${appBaseUrl()}/portal/${searchParams.newToken}`}
            </code>
            <CopyButton
              value={`${appBaseUrl()}/portal/${searchParams.newToken}`}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Address
          </h2>
          <form action={updateSchoolAction} className="space-y-3">
            <input type="hidden" name="id" value={school.id} />
            <input
              type="text"
              name="line1"
              defaultValue={school.address?.line1 ?? ""}
              placeholder="Line 1"
              required
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              name="line2"
              defaultValue={school.address?.line2 ?? ""}
              placeholder="Line 2"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <div className="grid grid-cols-[1fr_80px_120px] gap-2">
              <input
                type="text"
                name="city"
                defaultValue={school.address?.city ?? ""}
                placeholder="City"
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                name="state"
                defaultValue={school.address?.state ?? ""}
                maxLength={2}
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm uppercase focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                name="postalCode"
                defaultValue={school.address?.postalCode ?? ""}
                placeholder="ZIP"
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                name="latitude"
                defaultValue={school.address?.latitude?.toString() ?? ""}
                placeholder="Latitude"
                inputMode="decimal"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                name="longitude"
                defaultValue={school.address?.longitude?.toString() ?? ""}
                placeholder="Longitude"
                inputMode="decimal"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm font-medium tracking-tight focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
            >
              Save address
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Contacts
          </h2>
          {school.contacts.length === 0 ? (
            <p className="mb-3 text-sm text-slate-400">
              No contacts yet. Add one below so notifications have somewhere to
              land.
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {school.contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.title && (
                        <span className="ml-2 text-xs text-slate-400">
                          {c.title}
                        </span>
                      )}
                      {school.mainContactId === c.id && (
                        <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                          primary
                        </span>
                      )}
                    </div>
                    {school.mainContactId !== c.id && (
                      <form action={setMainContactAction}>
                        <input
                          type="hidden"
                          name="schoolId"
                          value={school.id}
                        />
                        <input type="hidden" name="contactId" value={c.id} />
                        <button
                          type="submit"
                          className="text-[10px] text-slate-400 hover:text-white"
                        >
                          make primary
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {c.email ?? "no email"} · {c.phone ?? "no phone"}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form
            action={createContactAction}
            className="space-y-2 border-t border-surface-border pt-3"
          >
            <input type="hidden" name="schoolId" value={school.id} />
            <input
              type="text"
              name="name"
              required
              placeholder="Full name"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                name="phone"
                placeholder="Phone"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <input
              type="email"
              name="email"
              placeholder="Email"
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                name="isPrimary"
                className="accent-accent"
              />
              Set as primary contact
            </label>
            <button
              type="submit"
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong"
            >
              Add contact
            </button>
          </form>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Recent tickets{" "}
          <span className="font-medium tracking-tight text-xs text-slate-500">
            {school._count.tickets} total
          </span>
        </h2>
        {school.tickets.length === 0 ? (
          <p className="text-sm text-slate-400">No tickets yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {school.tickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded border border-surface-border bg-surface-muted/40 px-3 py-1.5"
              >
                <Link
                  href={`/tickets/${t.incidentNumber}`}
                  className="font-medium tracking-tight text-accent hover:underline"
                >
                  {t.incidentNumber}
                </Link>
                <StatePill state={t.state} />
                <span className="flex-1 px-3 truncate text-slate-400">
                  {t.shortDescription}
                </span>
                <span className="text-xs text-slate-500">
                  {t.reportedAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Devices{" "}
          <span className="font-medium tracking-tight text-xs text-slate-500">
            {school._count.devices} total
          </span>
        </h2>
        {school.devices.length === 0 ? (
          <p className="text-sm text-slate-400">No devices yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm md:grid-cols-2">
            {school.devices.map((d) => (
              <li
                key={d.id}
                className="rounded border border-surface-border bg-surface-muted/40 px-3 py-1.5"
              >
                <Link
                  href={`/admin/devices/${d.id}`}
                  className="font-medium tracking-tight text-accent hover:underline"
                >
                  {d.serialNumber}
                </Link>
                {d.assetTag && (
                  <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
                    {d.assetTag}
                  </span>
                )}
                {d.model && (
                  <span className="ml-2 text-xs text-slate-400">
                    {d.model.manufacturer} {d.model.modelName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Status portal links
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Generate a magic link that lets this school&apos;s IT lead view
          their open and recently-closed tickets without signing in.
          Each link can be revoked at any time.
        </p>

        {school.portalTokens.length > 0 && (
          <ul className="mb-4 space-y-2 text-sm">
            {school.portalTokens.map((t) => {
              const revoked = t.revokedAt != null;
              const expired =
                t.expiresAt != null && t.expiresAt.getTime() <= Date.now();
              const active = !revoked && !expired;
              return (
                <li
                  key={t.id}
                  className={`rounded border bg-surface px-3 py-2 ${active ? "border-surface-border" : "border-surface-border opacity-60"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {t.label ?? "Unnamed"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        created {t.createdAt.toISOString().slice(0, 10)}
                        {t.expiresAt && (
                          <>
                            {" "}
                            · expires {t.expiresAt.toISOString().slice(0, 10)}
                          </>
                        )}
                        {t.lastUsedAt && (
                          <>
                            {" "}
                            · last used{" "}
                            {t.lastUsedAt.toISOString().slice(0, 10)}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {revoked && (
                        <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-200">
                          revoked
                        </span>
                      )}
                      {expired && !revoked && (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
                          expired
                        </span>
                      )}
                      {active && (
                        <>
                          {/* Round-18 — the field report: operators
                              copied a prefix rendered to look like
                              the link and got a 404. Regenerate is
                              the recovery path for lost plaintexts. */}
                          <form action={regeneratePortalTokenAction}>
                            <input type="hidden" name="tokenId" value={t.id} />
                            <input
                              type="hidden"
                              name="schoolId"
                              value={school.id}
                            />
                            <button
                              type="submit"
                              className="rounded border border-surface-border px-2 py-0.5 text-[10px] text-slate-300 hover:border-accent"
                              title="Issue a fresh link; the old one stops working"
                            >
                              Regenerate link
                            </button>
                          </form>
                          <form action={revokePortalTokenAction}>
                            <input type="hidden" name="tokenId" value={t.id} />
                            <input
                              type="hidden"
                              name="schoolId"
                              value={school.id}
                            />
                            <button
                              type="submit"
                              className="text-[10px] text-slate-400 hover:text-red-200"
                            >
                              revoke
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                  {active && (
                    <div className="mt-2 text-[10px] text-slate-400">
                      Link starts with{" "}
                      <code className="rounded bg-surface-muted px-1 text-slate-300">
                        {t.tokenPrefix ?? "????????"}
                      </code>{" "}
                      — the full link was shown once at creation.
                      Use Regenerate if it was lost.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          action={createPortalTokenAction}
          className="flex flex-wrap items-end gap-2 rounded border border-surface-border bg-surface-muted/60 p-3"
        >
          <input type="hidden" name="schoolId" value={school.id} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Label
            </span>
            <input
              type="text"
              name="label"
              placeholder="e.g. Jane Doe · IT lead"
              className="w-64 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Expires in (days, default 365)
            </span>
            <input
              type="number"
              name="expiresInDays"
              min={1}
              max={3650}
              placeholder="365"
              className="w-32 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Data scope
            </span>
            <select
              name="dataScope"
              defaultValue="STANDARD"
              className="w-44 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="STANDARD">Standard (full info)</option>
              <option value="MINIMAL">Minimal (counts only)</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
          >
            Generate link
          </button>
        </form>
      </section>
    </>
  );
}

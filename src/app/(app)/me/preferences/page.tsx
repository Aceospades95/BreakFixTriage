import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { updatePreferencesAction } from "@/server/actions/preferences";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A3 — /me/preferences.
 *
 * Theme picker (system / light / dark), digest opt-in + hour.
 * The brief's per-event channel matrix (in-app vs. email per
 * EmailEvent) is a JSON blob that needs a richer UI; filed for
 * the §A follow-up branch (see docs/round-3-qa-checklist.md
 * item 3).
 */
export default async function PreferencesPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireSession();

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.userId },
  });

  return (
    <>
      <PageHeader
        title="My preferences"
        subtitle={`Signed in as ${session.email}`}
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

      <form
        action={updatePreferencesAction}
        className="grid max-w-2xl gap-6"
      >
        <fieldset className="rounded-lg border border-surface-border bg-surface-muted/40 p-4">
          <legend className="px-2 text-sm font-semibold tracking-wide text-slate-300">
            Theme
          </legend>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {[
              { value: "system", label: "Match system" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ].map((opt) => {
              const active = (pref?.theme ?? "system") === opt.value;
              return (
                <label
                  key={opt.value}
                  className={
                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition " +
                    (active
                      ? "border-accent bg-accent/10 text-white"
                      : "border-surface-border text-slate-300 hover:border-accent")
                  }
                >
                  <input
                    type="radio"
                    name="theme"
                    value={opt.value}
                    defaultChecked={active}
                    className="hidden"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-surface-border bg-surface-muted/40 p-4">
          <legend className="px-2 text-sm font-semibold tracking-wide text-slate-300">
            Daily digest
          </legend>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="digestOptIn"
                defaultChecked={!!pref?.digestOptIn}
                className="h-4 w-4 accent-accent"
              />
              Email me a daily digest
            </label>
            <label className="flex items-center gap-2 text-xs">
              Hour (0–23):
              <input
                type="number"
                name="digestHour"
                min={0}
                max={23}
                defaultValue={pref?.digestHour ?? 7}
                className="w-16 rounded border border-surface-border bg-surface px-2 py-1 text-xs"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Channels are coarse for now: turn email on or off, and turn
            in-app on or off. Finer-grained per-event controls and a
            timezone selector are coming later.
          </p>
        </fieldset>

        <div>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Save preferences
          </button>
        </div>
      </form>
    </>
  );
}

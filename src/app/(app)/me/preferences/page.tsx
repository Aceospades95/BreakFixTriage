import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ThemePicker } from "@/components/theme-picker";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { updatePreferencesAction } from "@/server/actions/preferences";

export const dynamic = "force-dynamic";

/**
 * Round-3 §A3 + Round-12 §1G — /me/preferences.
 *
 * Theme picker is a dedicated client island (`<ThemePicker>`)
 * with optimistic-on-click semantics: clicking an option flips
 * the visual theme immediately, then POSTs /api/me/theme in the
 * background. No Save button required for theme. The Save button
 * on the digest fieldset stays for the digest fields.
 *
 * The pref's theme value is the server's current truth; the
 * picker re-renders from `initial` on first paint and owns its
 * state from then on.
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
        actions={
          <Link
            href="/profile"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ← Profile
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

      <fieldset className="mb-6 max-w-2xl rounded-lg border border-surface-border bg-surface-muted/40 p-4">
        <legend className="px-2 text-sm font-semibold tracking-wide text-slate-300">
          Theme
        </legend>
        <ThemePicker initial={pref?.theme ?? "system"} />
      </fieldset>

      <form
        action={updatePreferencesAction}
        className="grid max-w-2xl gap-6"
      >
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
              Send at:
              {/* Round-9 §1C — HH:MM time picker. Server action
                  parses HH:MM → integer hour for the existing
                  digestHour column. Operators get a familiar
                  picker; the underlying schema is unchanged. */}
              <input
                type="time"
                name="digestHour"
                step={3600}
                defaultValue={
                  pref?.digestHour != null
                    ? `${String(pref.digestHour).padStart(2, "0")}:00`
                    : "07:00"
                }
                className="rounded border border-surface-border bg-surface px-2 py-1 text-xs"
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

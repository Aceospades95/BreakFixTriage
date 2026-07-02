import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { requireSession } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/rbac";
import { getRawSetting } from "@/lib/settings/settings";
import {
  FAQ_ENTRIES,
  GUIDE_SECTIONS,
  HELP_SOPS_SETTING_KEY,
  parseSops,
} from "@/lib/help/content";
import { updateHelpSopsAction } from "@/server/actions/help";

export const dynamic = "force-dynamic";

/**
 * Round-22 (demo feedback) — the help center behind the `?` icon.
 * Three blocks: how the app works, the questions the team actually
 * asked in the demos, and a Team SOPs section managers edit in place
 * ("a help section where we can build out key questions and standard
 * operating procedures").
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams?: { ok?: string; error?: string; edit?: string };
}) {
  const session = await requireSession();
  // TEAM_NOTES_MANAGE, not USERS_MANAGE: SOPs are team-facing
  // operational content, the same class as urgent team notes — ops
  // managers and dispatchers maintain them, not just admins.
  const canEditSops = can(session.role, PERMISSIONS.TEAM_NOTES_MANAGE);
  const sopsRaw = (await getRawSetting(HELP_SOPS_SETTING_KEY)) as
    | string
    | null;
  const sops = parseSops(sopsRaw ?? "");
  const editing = canEditSops && searchParams?.edit === "1";

  return (
    <>
      <PageHeader
        title="Help center"
        subtitle="How the app works, answers to common questions, and this team's standard operating procedures."
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

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        {/* ── How the app works ── */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            How the app works
          </h2>
          <div className="space-y-4">
            {GUIDE_SECTIONS.map((s) => (
              <div
                key={s.title}
                className="rounded-lg border border-surface-border bg-surface-muted/40 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-200">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-8">
          {/* ── FAQ ── */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Common questions
            </h2>
            <div className="space-y-2">
              {FAQ_ENTRIES.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-lg border border-surface-border bg-surface-muted/40"
                >
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-200 hover:text-white">
                    {f.q}
                  </summary>
                  <p className="border-t border-surface-border px-4 py-3 text-sm leading-relaxed text-slate-400">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* ── Team SOPs (manager-editable) ── */}
          <section data-testid="team-sops">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Team SOPs
              </h2>
              {canEditSops && !editing && (
                <a
                  href="/help?edit=1"
                  className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-white"
                >
                  Edit SOPs
                </a>
              )}
            </div>

            {editing ? (
              <ActionForm
                action={updateHelpSopsAction}
                className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-4"
              >
                <p className="text-xs text-slate-400">
                  Start a section with <code>## Section title</code> on its
                  own line; everything under it is that section&apos;s body.
                  Saved for the whole team instantly.
                </p>
                <textarea
                  name="sops"
                  defaultValue={sopsRaw ?? ""}
                  rows={16}
                  maxLength={20000}
                  placeholder={"## Device intake\nScan every device at the warehouse door…\n\n## Printer on-sites\nAlways record the printer model, asset tag, IP address…"}
                  className="w-full rounded border border-surface-border bg-surface px-3 py-2 text-xs leading-relaxed focus:border-accent focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong"
                  >
                    Save SOPs
                  </button>
                  <a
                    href="/help"
                    className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:border-accent"
                  >
                    Cancel
                  </a>
                </div>
              </ActionForm>
            ) : sops.length === 0 ? (
              <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
                No team SOPs written yet.
                {canEditSops
                  ? " Hit Edit SOPs to add the first one — intake steps, printer on-site notes, escalation paths, anything the team should have at hand."
                  : " Ask a manager to add the team's procedures here."}
              </div>
            ) : (
              <div className="space-y-4">
                {sops.map((s, i) => (
                  <div
                    key={`${s.title}-${i}`}
                    className="rounded-lg border border-surface-border bg-surface-muted/40 p-4"
                  >
                    {s.title && (
                      <h3 className="text-sm font-semibold text-slate-200">
                        {s.title}
                      </h3>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

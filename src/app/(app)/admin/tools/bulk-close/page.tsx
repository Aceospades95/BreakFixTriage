import { TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import {
  bulkCloseStaleAction,
  previewBulkCloseStale,
} from "@/server/actions/maintenance";

export const dynamic = "force-dynamic";

/**
 * Round-3 §L11 — bulk close stale tickets, dry-run preview.
 *
 * Two-step flow:
 *   1. Operator submits the preview form. Page re-renders with the
 *      candidate list (read-only — no audit row written).
 *   2. Operator clicks the danger-styled "Close N tickets" button
 *      to commit. Each close goes through the state machine guard
 *      and writes a per-ticket audit row + a summary audit row.
 *
 * The Round-2 /admin/settings "Bulk close stale" form still works —
 * it redirects back to itself. This page is the dedicated, safer
 * surface for the same action.
 */
export default async function BulkCloseToolPage({
  searchParams,
}: {
  searchParams?: {
    state?: string;
    daysOld?: string;
    preview?: string;
    error?: string;
    ok?: string;
  };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const stateParam = searchParams?.state;
  const validStates = Object.values(TicketState) as string[];
  const state =
    stateParam && validStates.includes(stateParam)
      ? (stateParam as TicketState)
      : null;
  const daysOld = Math.max(
    1,
    parseInt(searchParams?.daysOld ?? "0", 10) || 0,
  );
  const showPreview = searchParams?.preview === "1" && state && daysOld > 0;

  let preview: Awaited<ReturnType<typeof previewBulkCloseStale>> | null = null;
  if (showPreview) {
    preview = await previewBulkCloseStale({ state, daysOld });
  }

  return (
    <>
      <PageHeader
        title="Bulk close stale tickets"
        subtitle="Two-step: preview which tickets would close, then commit. Closes go through the state-machine guard; each writes an audit row."
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
        method="get"
        className="mb-8 grid gap-4 rounded-lg border border-surface-border bg-surface-muted/40 p-5 sm:grid-cols-[1fr_140px_auto]"
      >
        <input type="hidden" name="preview" value="1" />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wide text-slate-400">
            State
          </span>
          <select
            name="state"
            required
            defaultValue={stateParam ?? TicketState.OUT_OF_SCOPE}
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            {Object.values(TicketState)
              .filter((s) => s !== "CLOSED" && s !== "ON_HOLD")
              .map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wide text-slate-400">
            Days old
          </span>
          <input
            type="number"
            name="daysOld"
            required
            min={1}
            max={3650}
            defaultValue={daysOld > 0 ? daysOld : 90}
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded border border-surface-border px-4 py-1.5 text-sm font-semibold transition hover:border-accent"
          >
            Preview
          </button>
        </div>
      </form>

      {showPreview && preview && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-amber-100">
            Preview
          </h2>
          <p className="mb-3 text-sm text-slate-300">
            <strong>{preview.candidates.length}</strong> ticket
            {preview.candidates.length === 1 ? "" : "s"} would close.
            {preview.capped && (
              <span className="ml-2 text-amber-200">
                (Capped at 500 — re-run after to clear the rest.)
              </span>
            )}
          </p>

          {preview.candidates.length === 0 ? (
            <div className="rounded border border-surface-border bg-surface/40 p-6 text-center text-sm text-slate-400">
              Nothing matches. Lower the days-old threshold or pick a
              different state.
            </div>
          ) : (
            <>
              <ul className="mb-4 max-h-[40vh] space-y-1 overflow-auto rounded border border-surface-border bg-surface px-3 py-2 text-xs">
                {preview.candidates.slice(0, 100).map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="text-slate-300">{c.incidentNumber}</span>
                    <span className="text-slate-400">{c.schoolName}</span>
                    <span className="ml-auto text-slate-500">
                      entered{" "}
                      {c.stateEnteredAt.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
                {preview.candidates.length > 100 && (
                  <li className="text-slate-500">
                    …and {preview.candidates.length - 100} more
                  </li>
                )}
              </ul>

              <form
                action={bulkCloseStaleAction}
                className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <input type="hidden" name="state" value={state ?? ""} />
                <input type="hidden" name="daysOld" value={String(daysOld)} />
                <input
                  type="hidden"
                  name="returnTo"
                  value="/admin/tools/bulk-close"
                />
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason (recommended) — e.g. Annual cleanup, 2026"
                  className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                />
                <a
                  href="/admin/tools/bulk-close"
                  className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
                >
                  Cancel
                </a>
                <ConfirmButton
                  message={`Close ${preview.candidates.length} ${humanise(state!)} tickets older than ${daysOld} days? This goes through the state machine; each ticket writes an audit row.`}
                >
                  Close {preview.candidates.length} ticket
                  {preview.candidates.length === 1 ? "" : "s"}
                </ConfirmButton>
              </form>
            </>
          )}
        </section>
      )}

      {!showPreview && (
        <div className="rounded border border-surface-border bg-surface-muted/30 p-10 text-center text-sm text-slate-400">
          Pick a state + days-old threshold and click Preview to see what
          would close.
        </div>
      )}
    </>
  );
}

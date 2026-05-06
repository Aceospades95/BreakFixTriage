import { TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  getDigestRecipients,
  getEscalationMultiplier,
  getHoldDays,
  getSlaThresholds,
} from "@/lib/settings/settings";
import { ConfirmButton } from "@/components/confirm-button";
import { updateSettingsAction } from "@/server/actions/settings";
import { bulkCloseStaleAction } from "@/server/actions/maintenance";

export const dynamic = "force-dynamic";

/**
 * Admin settings page.
 *
 * Single form that submits every editable knob to one server action.
 * That keeps the implementation tiny and lets the action emit a
 * single audit entry per save instead of one per field.
 *
 * The SLA section renders one row per ticket state so admins can
 * override any default. Blank input = fall back to the hardcoded
 * DEFAULT_SLA_DAYS. The literal string "none" disables SLA for
 * that state entirely.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const [holdDays, multiplier, thresholds, digestRecipients] = await Promise.all([
    getHoldDays(),
    getEscalationMultiplier(),
    getSlaThresholds(),
    getDigestRecipients(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Editable knobs for quote hold-window, SLA thresholds, and digest recipients."
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

      <form action={updateSettingsAction} className="space-y-8">
        <section className="rounded-lg border border-surface-border bg-surface-muted p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Quotes
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default hold-window (days)"
              hint="Applied when a quote is sent without an explicit override. Minimum 1 day — a 0-day window would make every sent quote auto-expire on the next sweep."
            >
              <input
                type="number"
                name="defaultHoldDays"
                defaultValue={holdDays}
                min={1}
                max={90}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Escalation
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Escalation multiplier"
              hint="A ticket must be >= (SLA × multiplier) days in state before the escalation sweeper flags it. 1 = escalate as soon as breached; 2 = escalate at 2× SLA."
            >
              <input
                type="number"
                name="escalationMultiplier"
                defaultValue={multiplier}
                min={1}
                max={10}
                step={0.5}
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            SLA thresholds (days)
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Override the default days-in-state threshold for any ticket
            state. Leave blank for the built-in default. Type{" "}
            <code className="font-medium tracking-tight">none</code> to disable SLA for a
            state.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(TicketState).map((state) => {
              const current = thresholds[state];
              const displayValue =
                current == null ? "none" : String(current);
              return (
                <label
                  key={state}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-40 font-medium tracking-tight uppercase text-slate-400">
                    {state}
                  </span>
                  <input
                    type="text"
                    name={`sla_${state}`}
                    defaultValue={displayValue}
                    className="w-24 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-muted p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Daily digest
          </h2>
          <Field
            label="Digest recipients"
            hint="One email per line. The daily digest script (npm run digest) sends to everyone on this list."
          >
            <textarea
              name="digestRecipients"
              rows={4}
              defaultValue={digestRecipients.join("\n")}
              className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </section>

        <div>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
          >
            Save settings
          </button>
        </div>
      </form>

      <section className="mt-10 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-200">
          Bulk close stale tickets
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Closes every ticket in the selected state whose
          <code className="mx-1 font-medium tracking-tight">stateEnteredAt</code>
          is older than the supplied day threshold. Runs through the
          state machine, so guards still apply. Maximum 500 tickets per
          run.
        </p>
        <form
          action={bulkCloseStaleAction}
          className="grid gap-3 sm:grid-cols-[1fr_120px_2fr_auto]"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              State
            </span>
            <select
              name="state"
              required
              defaultValue={TicketState.OUT_OF_SCOPE}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {Object.values(TicketState)
                .filter((s) => s !== "CLOSED" && s !== "ON_HOLD")
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Days old
            </span>
            <input
              type="number"
              name="daysOld"
              required
              min={1}
              max={3650}
              defaultValue={90}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Reason (optional)
            </span>
            <input
              type="text"
              name="reason"
              placeholder="e.g. Annual cleanup, 2026"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <ConfirmButton message="Close every matching stale ticket? This transitions them through the state machine and writes audit rows.">
              Close stale
            </ConfirmButton>
          </div>
        </form>
      </section>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

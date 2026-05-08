"use client";

import { useFormStatus } from "react-dom";
import { forceTransitionTicketAction } from "@/server/actions/tickets";

/**
 * Force-change form for the ticket detail page.
 *
 * Closes findings §3.A6: residual state after submit.
 *
 * The fix is two-part:
 *
 *   1. The PARENT (the ticket detail page) passes `formKey` derived
 *      from `ticket.state` + `ticket.stateEnteredAt`. When a force
 *      successfully lands and the page re-renders, the key changes,
 *      React unmounts and remounts this form, and every uncontrolled
 *      input resets to its empty default — no residual state.
 *   2. The submit button uses `useFormStatus().pending` to disable
 *      itself while the request is in flight, so a double-click
 *      can't fire the action twice with the same payload.
 *
 * Server-action redirects then trigger a toast via the global
 * ToastHost (?ok= / ?error= URL params), per the toast policy in
 * docs/ui-conventions.md.
 */
export function ForceChangeForm({
  ticketId,
  states,
}: {
  ticketId: string;
  states: { state: string; label: string }[];
}) {
  return (
    <form
      action={forceTransitionTicketAction}
      className="flex flex-col gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-2"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <select
        name="to"
        defaultValue=""
        required
        className="rounded border border-surface-border bg-surface-muted px-2 py-1 text-sm focus:border-accent focus:outline-none"
      >
        <option value="" disabled>
          Pick a target state…
        </option>
        {states.map((s) => (
          // Round-13 §1B — drop the "(AWAITING_ONSITE)" suffix.
          // The humanised label is sufficient in user-visible
          // text. Devs and tests grab the raw enum via the
          // data-state-key attribute below.
          <option key={s.state} value={s.state} data-state-key={s.state}>
            {s.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="reason"
        required
        minLength={3}
        placeholder="Reason (required)"
        className="rounded border border-surface-border bg-surface-muted px-2 py-1 text-xs focus:border-accent focus:outline-none"
      />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // Danger-style per findings §5.B3: force change must not match
      // any status pill colour. Red outlined with a warning glyph.
      className="inline-flex items-center justify-center gap-1.5 rounded border border-red-500/60 bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span aria-hidden="true">⚠</span>
      <span>{pending ? "Forcing…" : "Force change"}</span>
    </button>
  );
}

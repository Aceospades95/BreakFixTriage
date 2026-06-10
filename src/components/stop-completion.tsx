"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Round-18 §3 — guarded completion for a route stop.
 *
 * "Complete" used to be a bare one-click button; nothing made the
 * technician confirm the actual work (devices handed over, proof
 * captured) before the ticket state cascaded. This panel lists each
 * device line as a check-off item plus a final confirmation, and
 * only then enables "Complete stop & save" — which submits the
 * existing updateStopStatusAction (audit + ticket cascade + email
 * dispatch unchanged). The check-offs are a procedural gate, not
 * stored rows; the durable record is the stop completion audit and
 * the attached proof.
 */
export function StopCompletion({
  action,
  stopId,
  routeId,
  items,
  enabled,
  disabledHint,
}: {
  action: (formData: FormData) => Promise<void> | void;
  stopId: string;
  routeId: string;
  /** One label per piece of work, e.g. "Pick up SN-0001 (HP ProBook)". */
  items: { id: string; label: string }[];
  /** False until the stop status allows completing (en route / arrived). */
  enabled: boolean;
  disabledHint?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const allChecked = items.every((i) => checked.has(i.id));
  const ready = enabled && allChecked && confirmed;

  function toggle(id: string) {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      data-testid="stop-completion"
      className="rounded border border-surface-border bg-surface p-3"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Finish this stop
      </div>
      {!enabled && disabledHint && (
        <p className="mb-2 text-xs text-slate-400">{disabledHint}</p>
      )}
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={checked.has(i.id)}
                onChange={() => toggle(i.id)}
                disabled={!enabled}
                className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-primary))]"
              />
              <span>{i.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="mt-3 flex items-start gap-2 border-t border-surface-border pt-3 text-sm font-medium text-slate-100">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={!enabled || !allChecked}
          className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-primary))]"
        />
        <span>
          I confirm the work above is done and proof is attached where
          required.
        </span>
      </label>
      <form action={action} className="mt-3">
        <input type="hidden" name="stopId" value={stopId} />
        <input type="hidden" name="routeId" value={routeId} />
        <input type="hidden" name="status" value="COMPLETED" />
        <input type="hidden" name="returnTo" value="route" />
        <CompleteButton
          ready={ready}
          hint={
            !enabled
              ? undefined
              : !allChecked
                ? "Check off every line above first"
                : !confirmed
                  ? "Tick the confirmation to enable saving"
                  : undefined
          }
        />
      </form>
    </div>
  );
}

function CompleteButton({ ready, hint }: { ready: boolean; hint?: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      <button
        type="submit"
        disabled={!ready || pending}
        className="rounded bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Complete stop & save"}
      </button>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Round-18 §3 / Round-20 — guarded completion for a route stop.
 *
 * "Complete" used to be a bare one-click button; nothing made the
 * technician confirm the actual work (devices handed over, proof
 * captured) before the ticket state cascaded. This panel lists each
 * device line as a check-off item plus a final confirmation, and
 * only then enables "Complete stop & save".
 *
 * Round-20 (NY team: "we should have to select what we are picking
 * up") made the check-offs REAL: each device line is a
 * `confirmedDeviceIds` form field submitted with the completion,
 * and updateStopStatusAction refuses to complete a stop whose
 * active lines aren't all confirmed — stamping confirmedAt /
 * confirmedByUserId on each StopDevice row as the durable record.
 */
export function StopCompletion({
  action,
  stopId,
  routeId,
  items,
  enabled,
  disabledHint,
  proofCount,
}: {
  action: (formData: FormData) => Promise<void> | void;
  stopId: string;
  routeId: string;
  /**
   * One entry per piece of work. `deviceId` is set for real
   * StopDevice lines (submitted as confirmedDeviceIds); the generic
   * no-devices fallback item leaves it null.
   */
  items: { id: string; label: string; deviceId: string | null }[];
  /** False until the stop status allows completing (en route / arrived). */
  enabled: boolean;
  disabledHint?: string;
  /**
   * Photos + signatures already attached to this stop. Zero turns
   * the confirmation into an explicit "completing without proof"
   * acknowledgement — a nudge, not a hard gate, because drivers in
   * dead zones must still be able to close out (backlog F2 tracks
   * the enforced version pending the offline design).
   */
  proofCount?: number;
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
    <form
      action={action}
      data-testid="stop-completion"
      className="rounded border border-surface-border bg-surface p-3"
    >
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="status" value="COMPLETED" />
      <input type="hidden" name="returnTo" value="route" />
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
                name={i.deviceId ? "confirmedDeviceIds" : undefined}
                value={i.deviceId ?? undefined}
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
      {enabled && proofCount === 0 && (
        <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          No photo or signature is attached to this stop yet — capture
          proof above before completing if this visit requires it.
        </p>
      )}
      <label className="mt-3 flex items-start gap-2 border-t border-surface-border pt-3 text-sm font-medium text-slate-100">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={!enabled || !allChecked}
          className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-primary))]"
        />
        <span>
          {proofCount === 0
            ? "I confirm the work above is done — I'm completing this stop without attached proof."
            : "I confirm the work above is done and proof is attached where required."}
        </span>
      </label>
      <div className="mt-3">
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
      </div>
    </form>
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

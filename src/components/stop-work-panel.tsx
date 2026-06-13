"use client";

import { useState } from "react";
import { JobStatus, ProofRule, StopLineState } from "@prisma/client";
import { ActionForm, useActionFormPending } from "@/components/action-form";
import {
  describeProofRule,
  evaluateCompletionGate,
  isProofSatisfied,
} from "@/lib/scheduling/stop-lines";

/**
 * Round-22 §1C/§1D — the on-site checklist + completion gate.
 *
 * Once the technician is on site, every expected line item is resolved
 * here: Verified (handed over / collected), Not found, or Refused, each
 * with an optional note. The gate (shared with the server via
 * evaluateCompletionGate) decides which outcome is allowed:
 *
 *   - all verified + proof satisfied  → Complete
 *   - a mix of verified + not-found   → Save as partial (PARTIAL)
 *   - proof rule unmet                → an override reason unlocks either
 *
 * The buttons are disabled with an honest reason until the gate opens,
 * so no dead controls and no native-validation surprises.
 */

export interface PanelLine {
  id: string;
  /** Human label: incident number + device, or "device to be recorded". */
  label: string;
  purpose: "PICKUP" | "DELIVERY";
}

// Only the three on-site resolution states are pickable here.
type Choice = StopLineState;

export function StopWorkPanel({
  action,
  stopId,
  routeId,
  lines,
  proofRule,
  proofPresent,
  enabled,
  disabledHint,
  initialNotes,
}: {
  action: (formData: FormData) => Promise<void> | void;
  stopId: string;
  routeId: string;
  lines: PanelLine[];
  proofRule: ProofRule;
  proofPresent: { photo: boolean; signature: boolean };
  enabled: boolean;
  disabledHint?: string;
  initialNotes?: string | null;
}) {
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>(
    {},
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [override, setOverride] = useState("");

  const proofOk = isProofSatisfied(proofRule, proofPresent);
  const hasOverride = override.trim().length >= 5;

  const gate = evaluateCompletionGate({
    lines: lines.map((l) => ({
      state: choices[l.id] ?? StopLineState.EXPECTED,
    })),
    proofRule,
    proofPresent,
    hasProofOverride: hasOverride,
  });

  function setChoice(id: string, choice: Choice) {
    setChoices((c) => ({ ...c, [id]: choice }));
  }

  return (
    <ActionForm
      action={action}
      data-testid="stop-work-panel"
      className="space-y-3 rounded border border-surface-border bg-surface p-3"
    >
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="returnTo" value="route" />

      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        On-site checklist
      </div>

      {!enabled && disabledHint && (
        <p className="text-xs text-slate-400">{disabledHint}</p>
      )}

      {lines.length === 0 ? (
        <p className="text-xs text-slate-400">
          No line items on this stop — confirm the work is done and capture
          any proof, then complete.
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => {
            const choice = choices[line.id];
            const needsNote =
              choice === StopLineState.NOT_FOUND ||
              choice === StopLineState.REFUSED;
            return (
              <li
                key={line.id}
                data-testid="panel-line"
                className="rounded border border-surface-border bg-surface-muted/40 p-2"
              >
                <div className="text-sm text-slate-200">{line.label}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ChoiceButton
                    name={`line:${line.id}`}
                    value={StopLineState.VERIFIED}
                    label={line.purpose === "DELIVERY" ? "Delivered" : "Picked up"}
                    active={choice === StopLineState.VERIFIED}
                    tone="ok"
                    disabled={!enabled}
                    onPick={() => setChoice(line.id, StopLineState.VERIFIED)}
                  />
                  <ChoiceButton
                    name={`line:${line.id}`}
                    value={StopLineState.NOT_FOUND}
                    label="Not found"
                    active={choice === StopLineState.NOT_FOUND}
                    tone="warn"
                    disabled={!enabled}
                    onPick={() => setChoice(line.id, StopLineState.NOT_FOUND)}
                  />
                  <ChoiceButton
                    name={`line:${line.id}`}
                    value={StopLineState.REFUSED}
                    label="Refused"
                    active={choice === StopLineState.REFUSED}
                    tone="warn"
                    disabled={!enabled}
                    onPick={() => setChoice(line.id, StopLineState.REFUSED)}
                  />
                </div>
                {needsNote && (
                  <input
                    type="text"
                    name={`lineNote:${line.id}`}
                    value={notes[line.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [line.id]: e.target.value }))
                    }
                    maxLength={500}
                    placeholder="Add a note (e.g. device wasn't at the front office)"
                    disabled={!enabled}
                    className="mt-2 w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Proof status + override */}
      <div className="rounded border border-surface-border bg-surface-muted/40 p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-300">{describeProofRule(proofRule)}</span>
          <span
            className={
              proofOk
                ? "rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200"
                : "rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-200"
            }
          >
            {proofOk ? "Proof attached" : "Proof missing"}
          </span>
        </div>
        {!proofOk && enabled && (
          <label className="mt-2 block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Complete without proof — reason (required, 5+ chars)
            </span>
            <input
              type="text"
              name="proofOverrideReason"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              maxLength={500}
              placeholder="e.g. front office closed early; left with security and logged it"
              className="mt-1 w-full rounded border border-amber-500/40 bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
          </label>
        )}
      </div>

      {/* Stop notes */}
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Stop notes (optional)
        </span>
        <textarea
          name="notes"
          defaultValue={initialNotes ?? ""}
          rows={2}
          maxLength={2000}
          placeholder="Anything dispatch should know about this stop"
          disabled={!enabled}
          className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
        <SubmitButton
          status={JobStatus.COMPLETED}
          label="Complete stop"
          ready={enabled && gate.canComplete}
          tone="ok"
        />
        {(gate.canPartial || gate.anyUnsuccessful) && (
          <SubmitButton
            status={JobStatus.PARTIAL}
            label="Save as partial"
            ready={enabled && gate.canPartial}
            tone="warn"
          />
        )}
        {enabled && gate.blockedReason && (
          <span className="text-xs text-slate-500">{gate.blockedReason}</span>
        )}
      </div>
    </ActionForm>
  );
}

function ChoiceButton({
  name,
  value,
  label,
  active,
  tone,
  disabled,
  onPick,
}: {
  name: string;
  value: string;
  label: string;
  active: boolean;
  tone: "ok" | "warn";
  disabled: boolean;
  onPick: () => void;
}) {
  const activeCls =
    tone === "ok"
      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-100"
      : "border-amber-500/60 bg-amber-500/20 text-amber-100";
  return (
    <label
      className={`cursor-pointer rounded border px-2 py-1 text-xs font-semibold transition ${
        active
          ? activeCls
          : "border-surface-border bg-surface text-slate-300 hover:border-accent"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        onChange={onPick}
        disabled={disabled}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function SubmitButton({
  status,
  label,
  ready,
  tone,
}: {
  status: JobStatus;
  label: string;
  ready: boolean;
  tone: "ok" | "warn";
}) {
  const pending = useActionFormPending();
  const cls =
    tone === "ok"
      ? "bg-accent hover:bg-accent-strong"
      : "border border-amber-500/60 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30";
  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={!ready || pending}
      className={`rounded px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

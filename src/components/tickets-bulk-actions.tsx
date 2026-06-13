"use client";

import { useEffect, useMemo, useState } from "react";

// Round-11 §HOTFIX-1 — replaces the Round-10 BulkSelectionWatcher
// render-prop. A function-children prop cannot cross the
// server→client boundary (Next.js serializes children, and a
// `(count) => JSX` is not serializable), which is what threw the
// digest=3087090167 SSR error on /tickets in production.
//
// This component owns the form + bulk-actions row in a single
// client island. The server component renders the table as
// `children` JSX, which IS serializable.
//
// Round-21 — selection-aware targets + confirmation. Field feedback:
// "Apply does nothing." Two real causes: (1) picking a state the
// state machine rejects for every selected ticket, so 0 rows moved;
// (2) clicking Apply with no target picked at all. The dropdown now
// shows, per target, how many of the SELECTED tickets can legally
// move there (computed from the same transition table the server
// enforces), disables targets that apply to none, and a confirm step
// spells out exactly what will happen before anything fires.

type ServerAction = (formData: FormData) => Promise<void> | void;

export function TicketsBulkActions({
  returnTo,
  bulkTransitionAction,
  bulkAssignAction,
  assignableUsers,
  transitionOptions,
  ticketStates,
  allowedTransitions,
  children,
}: {
  returnTo: string;
  bulkTransitionAction: ServerAction;
  bulkAssignAction: ServerAction;
  assignableUsers: { id: string; name: string }[];
  transitionOptions: { value: string; label: string }[];
  /** state of every ticket row rendered in `children`, keyed by id */
  ticketStates: Record<string, string>;
  /** the server's transition table, so the picker can pre-compute legality */
  allowedTransitions: Record<string, readonly string[]>;
  children: React.ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState("");

  useEffect(() => {
    const form = document.getElementById(
      "tickets-bulk-form",
    ) as HTMLFormElement | null;
    if (!form) return;
    const recount = () => {
      const checked = form.querySelectorAll<HTMLInputElement>(
        'input[type=checkbox][name="ticketIds"]:checked',
      );
      setSelectedIds(Array.from(checked).map((c) => c.value));
    };
    recount();
    form.addEventListener("change", recount);
    return () => form.removeEventListener("change", recount);
  }, []);

  const count = selectedIds.length;

  // For each candidate target state: how many of the selected tickets
  // can legally move there right now?
  const eligibleByTarget = useMemo(() => {
    const out = new Map<string, number>();
    for (const opt of transitionOptions) {
      let n = 0;
      for (const id of selectedIds) {
        const from = ticketStates[id];
        if (from && allowedTransitions[from]?.includes(opt.value)) n += 1;
      }
      out.set(opt.value, n);
    }
    return out;
  }, [selectedIds, transitionOptions, ticketStates, allowedTransitions]);

  const eligibleForTarget = target ? (eligibleByTarget.get(target) ?? 0) : 0;
  const targetLabel =
    transitionOptions.find((o) => o.value === target)?.label ?? target;

  function confirmTransition(e: React.MouseEvent<HTMLButtonElement>) {
    if (count === 0) return; // button is disabled anyway
    if (!target) {
      e.preventDefault();
      window.alert("Pick a target status first, then Apply.");
      return;
    }
    if (eligibleForTarget === 0) {
      e.preventDefault();
      window.alert(
        `None of the ${count} selected ticket${count === 1 ? "" : "s"} can move to “${targetLabel}” from their current status — nothing would change. Pick a different target, or change the selection.`,
      );
      return;
    }
    const skipped = count - eligibleForTarget;
    const message =
      skipped > 0
        ? `Move ${eligibleForTarget} of ${count} selected ticket${count === 1 ? "" : "s"} to “${targetLabel}”?\n\n${skipped} will be skipped — the status flow does not allow “${targetLabel}” from their current status. They stay unchanged.`
        : `Move ${count} ticket${count === 1 ? "" : "s"} to “${targetLabel}”?`;
    if (!window.confirm(message)) e.preventDefault();
  }

  function confirmAssign(e: React.MouseEvent<HTMLButtonElement>) {
    if (count === 0) return;
    const form = e.currentTarget.form;
    const select = form?.elements.namedItem(
      "assigneeUserId",
    ) as HTMLSelectElement | null;
    const who =
      select && select.value
        ? (assignableUsers.find((u) => u.id === select.value)?.name ??
          "the selected user")
        : null;
    const message = who
      ? `Assign ${count} ticket${count === 1 ? "" : "s"} to ${who}?`
      : `Clear the assignee on ${count} ticket${count === 1 ? "" : "s"}?`;
    if (!window.confirm(message)) e.preventDefault();
  }

  return (
    <form id="tickets-bulk-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div
        className="mb-2 flex flex-wrap items-end gap-3 rounded border border-surface-border bg-surface-muted/40 p-3 text-xs"
        data-testid="bulk-actions"
      >
        <span className="text-[10px] tracking-wide text-slate-300">
          Bulk actions{count > 0 ? ` (${count} selected)` : ""}
        </span>
        <label className="flex items-center gap-1">
          Transition to:
          <select
            name="to"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="" disabled>
              pick state…
            </option>
            {transitionOptions.map((o) => {
              const eligible = eligibleByTarget.get(o.value) ?? 0;
              const annotate = count > 0;
              return (
                <option
                  key={o.value}
                  value={o.value}
                  disabled={annotate && eligible === 0}
                >
                  {o.label}
                  {annotate
                    ? eligible === count
                      ? ` — all ${count}`
                      : ` — ${eligible} of ${count}`
                    : ""}
                </option>
              );
            })}
          </select>
          <input
            type="text"
            name="reason"
            placeholder="reason (required to apply)"
            className="w-40 rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            formAction={bulkTransitionAction}
            disabled={count === 0}
            onClick={confirmTransition}
            title={count === 0 ? "Select at least one ticket" : undefined}
            className="rounded bg-accent px-2 py-0.5 text-xs font-semibold hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </label>
        <label className="flex items-center gap-1">
          Assign to:
          <select
            name="assigneeUserId"
            defaultValue=""
            className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="">— unassign —</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            formAction={bulkAssignAction}
            disabled={count === 0}
            onClick={confirmAssign}
            title={count === 0 ? "Select at least one ticket" : undefined}
            className="rounded bg-accent px-2 py-0.5 text-xs font-semibold hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </label>
        {count > 0 && target ? (
          <span
            data-testid="bulk-eligibility-hint"
            className={
              eligibleForTarget === 0
                ? "text-red-300"
                : eligibleForTarget < count
                  ? "text-amber-300"
                  : "text-emerald-300"
            }
          >
            {eligibleForTarget === 0
              ? `None of the selected tickets can move to ${targetLabel} from their current status.`
              : eligibleForTarget < count
                ? `${eligibleForTarget} of ${count} selected will move to ${targetLabel}; the rest will be skipped.`
                : `All ${count} selected can move to ${targetLabel}.`}
          </span>
        ) : (
          <span className="text-slate-500">
            Actions apply to checked rows only.
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        {children}
      </div>
    </form>
  );
}

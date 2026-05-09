"use client";

import { useEffect, useState } from "react";

// Round-11 §HOTFIX-1 — replaces the Round-10 BulkSelectionWatcher
// render-prop. A function-children prop cannot cross the
// server→client boundary (Next.js serializes children, and a
// `(count) => JSX` is not serializable), which is what threw the
// digest=3087090167 SSR error on /tickets in production.
//
// This component owns the form + bulk-actions row in a single
// client island. The server component renders the table as
// `children` JSX, which IS serializable.

type ServerAction = (formData: FormData) => Promise<void> | void;

export function TicketsBulkActions({
  returnTo,
  bulkTransitionAction,
  bulkAssignAction,
  assignableUsers,
  transitionOptions,
  children,
}: {
  returnTo: string;
  bulkTransitionAction: ServerAction;
  bulkAssignAction: ServerAction;
  assignableUsers: { id: string; name: string }[];
  transitionOptions: { value: string; label: string }[];
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(
      "tickets-bulk-form",
    ) as HTMLFormElement | null;
    if (!form) return;
    const recount = () => {
      const checked = form.querySelectorAll(
        'input[type=checkbox][name="ticketIds"]:checked',
      );
      setCount(checked.length);
    };
    recount();
    form.addEventListener("change", recount);
    return () => form.removeEventListener("change", recount);
  }, []);

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
            defaultValue=""
            className="rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="" disabled>
              pick state…
            </option>
            {transitionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="reason"
            placeholder="reason (optional)"
            className="w-40 rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            formAction={bulkTransitionAction}
            disabled={count === 0}
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
            title={count === 0 ? "Select at least one ticket" : undefined}
            className="rounded bg-accent px-2 py-0.5 text-xs font-semibold hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </label>
        <span className="text-slate-500">
          Actions apply to checked rows only.
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        {children}
      </div>
    </form>
  );
}

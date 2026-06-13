"use client";

import { useState } from "react";

/**
 * Round-22 — recipient editor for an email rule.
 *
 * Manages the to/cc/bcc buckets as editable rows (kind dropdown +
 * an address box that only shows for the "literal" kind), keeps a
 * hidden `recipientsJson` field in sync, and submits through
 * updateEmailRuleRecipientsAction. The server re-validates through
 * the same isRecipientSet gate the resolver trusts.
 */

type Bucket = "to" | "cc" | "bcc";
type Kind =
  | "spoc"
  | "ticket_reporter"
  | "wynndalco_team"
  | "district_leadership"
  | "internal_leadership"
  | "prime_leadership"
  | "literal";

interface Row {
  bucket: Bucket;
  kind: Kind;
  value: string;
}

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "spoc", label: "School SPOC contacts" },
  { value: "ticket_reporter", label: "Ticket reporter" },
  { value: "wynndalco_team", label: "Internal team list" },
  { value: "district_leadership", label: "District leadership" },
  { value: "internal_leadership", label: "Internal leadership" },
  { value: "prime_leadership", label: "Prime-contract leadership" },
  { value: "literal", label: "Specific address…" },
];

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "to", label: "To" },
  { value: "cc", label: "Cc" },
  { value: "bcc", label: "Bcc" },
];

export function EmailRecipientEditor({
  ruleId,
  action,
  initial,
}: {
  ruleId: string;
  action: (formData: FormData) => Promise<void> | void;
  initial: { to: Row[]; cc: Row[]; bcc: Row[] };
}) {
  const [rows, setRows] = useState<Row[]>([
    ...initial.to.map((r) => ({ ...r, bucket: "to" as Bucket })),
    ...initial.cc.map((r) => ({ ...r, bucket: "cc" as Bucket })),
    ...initial.bcc.map((r) => ({ ...r, bucket: "bcc" as Bucket })),
  ]);

  function update(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((cur) => cur.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((cur) => [...cur, { bucket: "to", kind: "spoc", value: "" }]);
  }

  const serialized = JSON.stringify({
    to: rows
      .filter((r) => r.bucket === "to")
      .map((r) => ({ kind: r.kind, ...(r.kind === "literal" ? { value: r.value } : {}) })),
    cc: rows
      .filter((r) => r.bucket === "cc")
      .map((r) => ({ kind: r.kind, ...(r.kind === "literal" ? { value: r.value } : {}) })),
    bcc: rows
      .filter((r) => r.bucket === "bcc")
      .map((r) => ({ kind: r.kind, ...(r.kind === "literal" ? { value: r.value } : {}) })),
  });

  return (
    <form action={action} data-testid="recipient-editor" className="space-y-2">
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="recipientsJson" value={serialized} />
      {rows.length === 0 && (
        <p className="text-xs text-slate-500">
          No recipients yet — add at least one &quot;To&quot; line, then save.
        </p>
      )}
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Bucket"
              value={row.bucket}
              onChange={(e) => update(i, { bucket: e.target.value as Bucket })}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            >
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Recipient kind"
              value={row.kind}
              onChange={(e) => update(i, { kind: e.target.value as Kind })}
              className="rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {row.kind === "literal" && (
              <input
                type="email"
                aria-label="Email address"
                placeholder="name@example.com"
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className="w-56 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded border border-surface-border px-2 py-1 text-xs text-slate-400 hover:border-red-500/60 hover:text-red-200"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={add}
          className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-white"
        >
          + Add recipient
        </button>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
        >
          Save recipients
        </button>
      </div>
    </form>
  );
}

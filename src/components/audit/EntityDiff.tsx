/**
 * Field-by-field 2-column diff for audit-log entries.
 *
 * Round-2 §13 / §24. Replaces raw `{before, after}` JSON blobs
 * with a labelled diff for known entities. Unknown entities fall
 * through to a collapsible JSON view via `<details>`.
 *
 * Convention: missing keys render as "—". Removed values render
 * red, added values render green, changed values render both.
 *
 * Field labels (not column names) come from FIELD_LABELS below.
 * Add an entry there when a new entity needs nice diff rendering.
 * Anything not listed is shown verbatim with the column name
 * humanised (`assignedUserId` → "Assigned User Id"); good enough
 * for a first pass.
 */

import { humaniseEnum } from "@/lib/cn";

interface DiffRow {
  label: string;
  field: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

/**
 * Friendly field labels per known entity. Keys are the
 * AuditLog.entityType strings; values map column name → label.
 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  Ticket: {
    state: "State",
    priority: "Priority",
    shortDescription: "Summary",
    longDescription: "Description",
    assignedUserId: "Assignee",
    invoiceRequired: "Invoice required",
    reason: "Reason",
    transitionType: "Source",
  },
  Route: {
    status: "Status",
    assigneeUserId: "Driver",
    vehicleRef: "Vehicle",
    optimizerName: "Optimizer",
  },
  AppSetting: {
    holdDays: "Default hold-window (days)",
    escalationMultiplier: "Escalation multiplier",
  },
  EmailRule: {
    enabled: "Enabled",
    event: "Event",
    scope: "Scope",
    scopeId: "Scope id",
    templateId: "Template",
  },
  EmailTemplate: {
    key: "Key",
    subject: "Subject",
    bodyHtml: "Body (HTML)",
    bodyText: "Body (text)",
  },
  EmailLog: {
    status: "Status",
    to: "To",
    cc: "Cc",
    bcc: "Bcc",
    providerMessageId: "Provider id",
    error: "Error",
    reason: "Reason",
    transitionType: "Source",
  },
  Comment: {
    body: "Body",
    ticketId: "Ticket",
  },
  Quote: {
    status: "Status",
    amountCents: "Amount (cents)",
    holdUntil: "Hold until",
  },
  School: {
    name: "Name",
    code: "Code",
    notes: "Notes",
    needsAddress: "Needs address",
  },
  SchoolContact: {
    receivesTicketEmails: "Receives ticket emails",
    receivesQuoteEmails: "Receives quote emails",
    receivesDeliveryReceipts: "Receives delivery receipts",
    ccOnAllTickets: "Cc on all tickets",
    preferredLanguage: "Preferred language",
  },
};

function labelFor(entityType: string, field: string): string {
  const map = FIELD_LABELS[entityType];
  if (map && field in map) return map[field]!;
  // humaniseEnum doesn't handle camelCase, so do a lite split.
  const split = field
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
  return split.charAt(0).toUpperCase() + split.slice(1).toLowerCase();
}

function isValueObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function buildRows(
  entityType: string,
  before: unknown,
  after: unknown,
): DiffRow[] {
  const beforeObj = isValueObject(before) ? before : {};
  const afterObj = isValueObject(after) ? after : {};
  const keys = new Set([
    ...Object.keys(beforeObj),
    ...Object.keys(afterObj),
  ]);
  // Drop the audit-mirror fields that the writer auto-injects;
  // they show up as their own dedicated column on the audit page.
  keys.delete("reason");
  keys.delete("transitionType");
  const rows: DiffRow[] = [];
  for (const k of keys) {
    const a = beforeObj[k];
    const b = afterObj[k];
    rows.push({
      label: labelFor(entityType, k),
      field: k,
      before: a,
      after: b,
      changed: !valuesEqual(a, b),
    });
  }
  rows.sort((x, y) => x.label.localeCompare(y.label));
  return rows;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  // For arrays / objects, do a JSON.stringify compare. Unstable
  // for differently-keyed orderings of the same data; good enough
  // for audit purposes.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") {
    // Treat ALL_CAPS_SNAKE strings (TicketState, QuoteStatus, etc.)
    // as enums and titlecase them.
    if (/^[A-Z][A-Z0-9_]+$/.test(v)) return humaniseEnum(v);
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map((x) => renderValue(x)).join(", ");
  }
  // Last resort: stringify (audit log used to render this raw).
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function EntityDiff({
  entityType,
  before,
  after,
}: {
  entityType: string;
  before: unknown;
  after: unknown;
}) {
  // If we have no field labels for this type AND no useful keys,
  // fall back to a JSON `<details>` so the audit page never just
  // says "—" when something genuinely happened.
  const hasMap = entityType in FIELD_LABELS;
  if (
    !hasMap &&
    !isValueObject(before) &&
    !isValueObject(after) &&
    before == null &&
    after == null
  ) {
    return <span className="text-slate-600">—</span>;
  }

  const rows = buildRows(entityType, before, after);
  if (rows.length === 0) {
    return (
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-white">
          (no field-level changes recorded)
        </summary>
        <pre className="mt-1 max-w-lg overflow-auto whitespace-pre-wrap text-[11px]">
          {JSON.stringify({ before: before ?? null, after: after ?? null }, null, 1)}
        </pre>
      </details>
    );
  }

  return (
    <table className="min-w-full border-separate border-spacing-x-2 text-xs">
      <thead className="sr-only">
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field}>
            <td className="whitespace-nowrap pr-2 align-top text-slate-400">
              {row.label}
            </td>
            <td
              className={
                row.changed && row.before !== undefined
                  ? "align-top text-red-300/80 line-through"
                  : "align-top text-slate-300"
              }
            >
              {renderValue(row.before)}
            </td>
            <td
              className={
                row.changed && row.after !== undefined
                  ? "align-top font-medium text-emerald-200"
                  : "align-top text-slate-300"
              }
            >
              {renderValue(row.after)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

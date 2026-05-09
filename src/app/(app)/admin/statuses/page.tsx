import { TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { ALLOWED_TRANSITIONS, TERMINAL_STATES } from "@/lib/workflow/states";
import { DEFAULT_SLA_DAYS } from "@/lib/reports/sla";
import {
  loadStatusConfig,
  getTicketCountsByState,
  saveStatusConfigAction,
  resetStatusConfigAction,
} from "@/server/actions/statuses";
import { StatusEditor } from "./status-editor";

export const dynamic = "force-dynamic";

/**
 * Human-readable labels for each state. Round-8 §1A: sentence case
 * is the canonical render — first letter capitalised, the rest in
 * lowercase except for documented acronyms (RMA, SLA, etc.). The
 * Title Case mix from Round-3 / Round-4 is now consistent
 * sentence case with humanise() (which preserves the acronyms).
 */
const STATE_LABELS: Record<TicketState, string> = {
  IMPORTED: "Imported",
  TRIAGE: "Triage",
  AWAITING_PICKUP: "Awaiting pickup",
  PICKUP_SCHEDULED: "Pickup scheduled",
  IN_WAREHOUSE: "In warehouse",
  DIAGNOSIS: "Diagnosis",
  AWAITING_PARTS: "Awaiting parts",
  PARTS_ORDERED: "Parts ordered",
  IN_REPAIR: "In repair",
  REPAIR_COMPLETED: "Repair completed",
  AWAITING_ONSITE: "Awaiting onsite",
  ONSITE_IN_PROGRESS: "Onsite in progress",
  QUOTE_REQUIRED: "Quote required",
  QUOTE_SENT: "Quote sent",
  QUOTE_APPROVED: "Quote approved",
  QUOTE_DECLINED: "Quote declined",
  QUOTE_NO_RESPONSE: "Quote no response",
  MANUFACTURER_RMA: "Manufacturer RMA",
  OUT_OF_SCOPE: "Out of scope",
  PENDING_DELIVERY: "Pending delivery",
  DELIVERY_SCHEDULED: "Delivery scheduled",
  RETURNED: "Returned",
  INVOICE_REQUIRED: "Invoice required",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  ON_HOLD: "On hold",
  PENDING_PICKUP_UNLINKED: "Pending pickup (unlinked)",
};

/** Color groupings for visual display */
const STATE_COLORS: Record<TicketState, string> = {
  IMPORTED: "blue",
  TRIAGE: "blue",
  AWAITING_PICKUP: "indigo",
  PICKUP_SCHEDULED: "indigo",
  IN_WAREHOUSE: "amber",
  DIAGNOSIS: "amber",
  AWAITING_PARTS: "orange",
  PARTS_ORDERED: "orange",
  IN_REPAIR: "amber",
  REPAIR_COMPLETED: "emerald",
  AWAITING_ONSITE: "indigo",
  ONSITE_IN_PROGRESS: "indigo",
  QUOTE_REQUIRED: "violet",
  QUOTE_SENT: "violet",
  QUOTE_APPROVED: "emerald",
  QUOTE_DECLINED: "red",
  QUOTE_NO_RESPONSE: "red",
  MANUFACTURER_RMA: "violet",
  OUT_OF_SCOPE: "red",
  PENDING_DELIVERY: "indigo",
  DELIVERY_SCHEDULED: "indigo",
  RETURNED: "emerald",
  INVOICE_REQUIRED: "orange",
  CLOSED: "slate",
  REOPENED: "red",
  ON_HOLD: "slate",
  // Round-4 §N1: same intake colour as IMPORTED/TRIAGE so the
  // visual lane signals "needs human routing".
  PENDING_PICKUP_UNLINKED: "blue",
};

const STAGE_GROUPS = [
  // Round-4 §N1: PENDING_PICKUP_UNLINKED is intake-flavored — the
  // device is in the building waiting for routing.
  { label: "Intake", states: ["IMPORTED", "TRIAGE", "PENDING_PICKUP_UNLINKED"] as TicketState[] },
  {
    label: "Field Work",
    states: [
      "AWAITING_PICKUP",
      "PICKUP_SCHEDULED",
      "AWAITING_ONSITE",
      "ONSITE_IN_PROGRESS",
    ] as TicketState[],
  },
  {
    label: "Warehouse & Repair",
    states: [
      "IN_WAREHOUSE",
      "DIAGNOSIS",
      "IN_REPAIR",
      "REPAIR_COMPLETED",
    ] as TicketState[],
  },
  {
    label: "Parts & Quotes",
    states: [
      "AWAITING_PARTS",
      "PARTS_ORDERED",
      "QUOTE_REQUIRED",
      "QUOTE_SENT",
      "QUOTE_APPROVED",
      "QUOTE_DECLINED",
      "QUOTE_NO_RESPONSE",
    ] as TicketState[],
  },
  {
    label: "Delivery & Close",
    states: [
      "MANUFACTURER_RMA",
      "OUT_OF_SCOPE",
      "PENDING_DELIVERY",
      "DELIVERY_SCHEDULED",
      "RETURNED",
      "INVOICE_REQUIRED",
      "CLOSED",
      "REOPENED",
    ] as TicketState[],
  },
  { label: "Special", states: ["ON_HOLD"] as TicketState[] },
];

export default async function StatusesPage({
  searchParams,
}: {
  searchParams?: { saved?: string; reset?: string; error?: string };
}) {
  await requireRole(PERMISSIONS.USERS_MANAGE);

  const [{ config, hasOverrides }, ticketCounts] = await Promise.all([
    loadStatusConfig(),
    getTicketCountsByState(),
  ]);

  const allStates = Object.values(TicketState);

  // Build reverse lookup: state → default section name (from STAGE_GROUPS)
  const DEFAULT_SECTION: Record<string, string> = {};
  for (const group of STAGE_GROUPS) {
    for (const s of group.states) {
      DEFAULT_SECTION[s] = group.label;
    }
  }

  // Build the effective state data for the editor
  const stateData = allStates.map((state) => {
    const defaultLabel = STATE_LABELS[state];
    const defaultSection = DEFAULT_SECTION[state] ?? "Special";
    return {
      state,
      label: config.labels?.[state] ?? defaultLabel,
      defaultLabel,
      color: STATE_COLORS[state],
      section: config.sections?.[state] ?? defaultSection,
      defaultSection,
      isTerminal: TERMINAL_STATES.includes(state),
      defaultTransitions: [...ALLOWED_TRANSITIONS[state]] as TicketState[],
      currentTransitions: (config.transitions[state] ??
        ALLOWED_TRANSITIONS[state]) as TicketState[],
      defaultSla: DEFAULT_SLA_DAYS[state],
      currentSla:
        state in config.sla ? config.sla[state]! : DEFAULT_SLA_DAYS[state],
      disabled: config.disabled.includes(state),
      activeTickets: ticketCounts[state] ?? 0,
    };
  });

  return (
    <>
      <PageHeader
        title="Status Management"
        subtitle="Configure ticket workflow states, transitions, and SLA thresholds."
      />

      {searchParams?.saved && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Status configuration saved successfully.
        </div>
      )}
      {searchParams?.reset && (
        <div className="mb-4 rounded border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          Status configuration reset to defaults.
        </div>
      )}
      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {hasOverrides && (
        <div className="mb-4 flex items-center gap-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-xs text-amber-300">
            Custom overrides are active. States with modifications are marked
            with *.
          </span>
          <form action={resetStatusConfigAction}>
            <button
              type="submit"
              className="rounded border border-surface-border px-2 py-1 text-xs text-slate-400 transition hover:border-amber-500 hover:text-amber-200"
            >
              Reset to defaults
            </button>
          </form>
        </div>
      )}

      <StatusEditor
        stateData={stateData}
        stageGroups={STAGE_GROUPS}
        allStates={allStates}
        saveAction={saveStatusConfigAction}
      />
    </>
  );
}

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

/** Human-readable labels for each state */
const STATE_LABELS: Record<TicketState, string> = {
  IMPORTED: "Imported",
  TRIAGE: "Triage",
  AWAITING_PICKUP: "Awaiting Pickup",
  PICKUP_SCHEDULED: "Pickup Scheduled",
  IN_WAREHOUSE: "In Warehouse",
  DIAGNOSIS: "Diagnosis",
  AWAITING_PARTS: "Awaiting Parts",
  PARTS_ORDERED: "Parts Ordered",
  IN_REPAIR: "In Repair",
  REPAIR_COMPLETED: "Repair Completed",
  AWAITING_ONSITE: "Awaiting Onsite",
  ONSITE_IN_PROGRESS: "Onsite In Progress",
  QUOTE_REQUIRED: "Quote Required",
  QUOTE_SENT: "Quote Sent",
  QUOTE_APPROVED: "Quote Approved",
  QUOTE_DECLINED: "Quote Declined",
  QUOTE_NO_RESPONSE: "Quote No Response",
  MANUFACTURER_RMA: "Manufacturer RMA",
  OUT_OF_SCOPE: "Out of Scope",
  PENDING_DELIVERY: "Pending Delivery",
  DELIVERY_SCHEDULED: "Delivery Scheduled",
  RETURNED: "Returned",
  INVOICE_REQUIRED: "Invoice Required",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  ON_HOLD: "On Hold",
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
};

const STAGE_GROUPS = [
  { label: "Intake", states: ["IMPORTED", "TRIAGE"] as TicketState[] },
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

"use client";

import { useMemo, useState } from "react";
import type { TicketState } from "@prisma/client";
import { cn } from "@/lib/cn";

export interface StateInfo {
  state: TicketState;
  /** Current effective label (custom or default) */
  label: string;
  /** Default label (so we can show "* modified" markers and revert) */
  defaultLabel: string;
  color: string;
  /** Current effective section (custom or default) */
  section: string;
  /** Default section */
  defaultSection: string;
  isTerminal: boolean;
  defaultTransitions: TicketState[];
  currentTransitions: TicketState[];
  defaultSla: number | null;
  currentSla: number | null;
  disabled: boolean;
  activeTickets: number;
}

interface StageGroup {
  label: string;
  /** States that default to this section (hardcoded) */
  states: TicketState[];
}

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  indigo: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
  amber: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  orange: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  violet: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  emerald: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  red: "bg-red-500/20 text-red-200 border-red-500/40",
  slate: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

export function StatusEditor({
  stateData: initialData,
  stageGroups,
  allStates,
  saveAction,
}: {
  stateData: StateInfo[];
  stageGroups: StageGroup[];
  allStates: TicketState[];
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [data, setData] = useState(initialData);
  const [expandedState, setExpandedState] = useState<TicketState | null>(null);
  const [view, setView] = useState<"list" | "sla">("list");
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newBaseState, setNewBaseState] = useState<TicketState | "">("");

  /** States available to be "added" to a new section — i.e. currently disabled */
  const availableStates = useMemo(
    () => data.filter((s) => s.disabled),
    [data],
  );

  /** Group data by current (overridden) section */
  const dataBySection = useMemo(() => {
    const map = new Map<string, StateInfo[]>();
    for (const s of data) {
      const bucket = map.get(s.section) ?? [];
      bucket.push(s);
      map.set(s.section, bucket);
    }
    return map;
  }, [data]);

  /** Section names in display order: stageGroups first, then any custom sections */
  const allSectionNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const g of stageGroups) {
      if (!seen.has(g.label)) {
        names.push(g.label);
        seen.add(g.label);
      }
    }
    for (const s of data) {
      if (!seen.has(s.section)) {
        names.push(s.section);
        seen.add(s.section);
      }
    }
    return names;
  }, [stageGroups, data]);

  function toggleDisabled(state: TicketState) {
    setData((prev) =>
      prev.map((s) =>
        s.state === state ? { ...s, disabled: !s.disabled } : s,
      ),
    );
  }

  function toggleTransition(from: TicketState, to: TicketState) {
    setData((prev) =>
      prev.map((s) => {
        if (s.state !== from) return s;
        const has = s.currentTransitions.includes(to);
        return {
          ...s,
          currentTransitions: has
            ? s.currentTransitions.filter((t) => t !== to)
            : [...s.currentTransitions, to],
        };
      }),
    );
  }

  function updateSla(state: TicketState, value: string) {
    setData((prev) =>
      prev.map((s) => {
        if (s.state !== state) return s;
        const num = value === "" ? null : parseInt(value, 10);
        return { ...s, currentSla: isNaN(num as number) ? null : num };
      }),
    );
  }

  function updateLabel(state: TicketState, value: string) {
    setData((prev) =>
      prev.map((s) => (s.state === state ? { ...s, label: value } : s)),
    );
  }

  function updateSection(state: TicketState, value: string) {
    setData((prev) =>
      prev.map((s) => (s.state === state ? { ...s, section: value } : s)),
    );
  }

  function handleAddStatus(section: string) {
    if (!newBaseState || !newLabel.trim()) return;
    setData((prev) =>
      prev.map((s) =>
        s.state === newBaseState
          ? {
              ...s,
              disabled: false,
              label: newLabel.trim(),
              section,
            }
          : s,
      ),
    );
    setAddingToSection(null);
    setNewLabel("");
    setNewBaseState("");
  }

  function handleSave() {
    const transitions: Record<string, string[]> = {};
    const sla: Record<string, number | null> = {};
    const labels: Record<string, string> = {};
    const sections: Record<string, string> = {};
    const disabled: string[] = [];

    for (const s of data) {
      const defaultSet = new Set(s.defaultTransitions);
      const currentSet = new Set(s.currentTransitions);
      const transDiff =
        defaultSet.size !== currentSet.size ||
        [...defaultSet].some((t) => !currentSet.has(t));
      if (transDiff) transitions[s.state] = s.currentTransitions;
      if (s.currentSla !== s.defaultSla) sla[s.state] = s.currentSla;
      if (s.label !== s.defaultLabel) labels[s.state] = s.label;
      if (s.section !== s.defaultSection) sections[s.state] = s.section;
      if (s.disabled) disabled.push(s.state);
    }

    const config = { transitions, sla, disabled, labels, sections };
    const formData = new FormData();
    formData.set("config", JSON.stringify(config));
    saveAction(formData);
  }

  function isModified(s: StateInfo): boolean {
    const transDefault = new Set(s.defaultTransitions);
    const transCurrent = new Set(s.currentTransitions);
    const transDiff =
      transDefault.size !== transCurrent.size ||
      [...transDefault].some((t) => !transCurrent.has(t));
    return (
      transDiff ||
      s.currentSla !== s.defaultSla ||
      s.label !== s.defaultLabel ||
      s.section !== s.defaultSection ||
      s.disabled
    );
  }

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === "list"
              ? "bg-primary text-white"
              : "text-slate-300 hover:bg-muted hover:text-white",
          )}
        >
          States & Transitions
        </button>
        <button
          type="button"
          onClick={() => setView("sla")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === "sla"
              ? "bg-primary text-white"
              : "text-slate-300 hover:bg-muted hover:text-white",
          )}
        >
          SLA Thresholds
        </button>
      </div>

      {view === "list" && (
        <div className="space-y-6">
          {allSectionNames.map((section) => {
            const sectionStates = dataBySection.get(section) ?? [];
            const isAdding = addingToSection === section;
            return (
              <div key={section}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setAddingToSection(isAdding ? null : section)
                    }
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-primary hover:text-primary"
                    title={
                      availableStates.length === 0
                        ? "No available slots — disable a state first"
                        : `Add a status to ${section}`
                    }
                    disabled={availableStates.length === 0 && !isAdding}
                  >
                    {isAdding ? "× Cancel" : "+ Add status"}
                  </button>
                </div>

                {/* Inline "add status" form */}
                {isAdding && (
                  <div className="mb-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                    {availableStates.length === 0 ? (
                      <div className="text-xs text-slate-400">
                        All 26 workflow slots are in use. Disable a state
                        somewhere else to free up a slot, then come back.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Display name
                          </span>
                          <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="e.g. Awaiting Approval"
                            className="w-52 rounded border border-border bg-background px-2 py-1 text-sm text-slate-200"
                            autoFocus
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Base slot (pool)
                          </span>
                          <select
                            value={newBaseState}
                            onChange={(e) =>
                              setNewBaseState(e.target.value as TicketState)
                            }
                            className="w-56 rounded border border-border bg-background px-2 py-1 text-sm text-slate-200"
                          >
                            <option value="">Pick an unused slot…</option>
                            {availableStates.map((s) => (
                              <option key={s.state} value={s.state}>
                                {s.state} (originally "{s.defaultLabel}")
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddStatus(section)}
                          disabled={!newLabel.trim() || !newBaseState}
                          className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add to {section}
                        </button>
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Note: the workflow schema has 26 fixed slots. Adding a
                      status re-uses one of them with a new display name.
                      Follow-up schema migrations can expand the pool.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  {sectionStates.map((s) => {
                    const expanded = expandedState === s.state;
                    const modified = isModified(s);

                    return (
                      <div
                        key={s.state}
                        className={cn(
                          "rounded-lg border transition",
                          s.disabled
                            ? "border-border/50 bg-muted/20 opacity-60"
                            : "border-border bg-muted",
                        )}
                      >
                        {/* State header row */}
                        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                              COLOR_CLASSES[s.color] ?? COLOR_CLASSES.slate,
                            )}
                          >
                            {s.state}
                          </span>

                          <span className="text-sm font-medium text-slate-200">
                            {s.label}
                            {modified && (
                              <span className="ml-1 text-amber-400">*</span>
                            )}
                          </span>

                          <div className="ml-auto flex flex-wrap items-center gap-2">
                            {s.activeTickets > 0 && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                                {s.activeTickets} active
                              </span>
                            )}
                            {s.isTerminal && (
                              <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">
                                terminal
                              </span>
                            )}
                            <span className="text-[10px] tabular-nums text-slate-500">
                              {s.currentTransitions.length} transition
                              {s.currentTransitions.length !== 1 ? "s" : ""}
                            </span>
                            {s.currentSla !== null && (
                              <span className="text-[10px] tabular-nums text-slate-500">
                                SLA: {s.currentSla}d
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleDisabled(s.state)}
                              disabled={s.activeTickets > 0}
                              className={cn(
                                "rounded border px-2 py-0.5 text-[10px] transition",
                                s.disabled
                                  ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                                  : "border-red-500/40 text-red-300 hover:bg-red-500/10",
                                s.activeTickets > 0 &&
                                  "cursor-not-allowed opacity-40",
                              )}
                              title={
                                s.activeTickets > 0
                                  ? `Cannot disable — ${s.activeTickets} active tickets`
                                  : s.disabled
                                    ? "Enable this state"
                                    : "Disable this state"
                              }
                            >
                              {s.disabled ? "Enable" : "Disable"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedState(
                                  expanded ? null : s.state,
                                )
                              }
                              className="rounded p-1 text-slate-400 transition hover:bg-muted hover:text-white"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  expanded && "rotate-180",
                                )}
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Expanded */}
                        {expanded && (
                          <div className="border-t border-border px-4 py-4">
                            {/* Label + section editors */}
                            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Display name
                                </span>
                                <input
                                  type="text"
                                  value={s.label}
                                  onChange={(e) =>
                                    updateLabel(s.state, e.target.value)
                                  }
                                  className="rounded border border-border bg-background px-2 py-1 text-sm text-slate-200"
                                />
                                {s.label !== s.defaultLabel && (
                                  <span className="text-[10px] text-amber-400">
                                    * default: {s.defaultLabel}
                                  </span>
                                )}
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Section
                                </span>
                                <select
                                  value={s.section}
                                  onChange={(e) =>
                                    updateSection(s.state, e.target.value)
                                  }
                                  className="rounded border border-border bg-background px-2 py-1 text-sm text-slate-200"
                                >
                                  {allSectionNames.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                                {s.section !== s.defaultSection && (
                                  <span className="text-[10px] text-amber-400">
                                    * default: {s.defaultSection}
                                  </span>
                                )}
                              </label>
                            </div>

                            {/* Transitions */}
                            <div className="mb-3 flex items-center gap-4">
                              <h4 className="text-xs font-semibold text-slate-300">
                                Allowed transitions from {s.label}
                              </h4>
                              <span className="text-[10px] text-muted-foreground">
                                Click to toggle.
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                              {allStates
                                .filter((t) => t !== s.state)
                                .map((target) => {
                                  const checked =
                                    s.currentTransitions.includes(target);
                                  const isDefault =
                                    s.defaultTransitions.includes(target);
                                  const targetData = data.find(
                                    (d) => d.state === target,
                                  )!;
                                  return (
                                    <label
                                      key={target}
                                      className={cn(
                                        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition",
                                        checked
                                          ? "bg-primary/10 text-slate-200"
                                          : "text-slate-500 hover:bg-muted hover:text-slate-300",
                                        targetData.disabled && "opacity-40",
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleTransition(s.state, target)
                                        }
                                        className="h-3.5 w-3.5 accent-primary"
                                      />
                                      <span>{targetData.label}</span>
                                      {checked !== isDefault && (
                                        <span className="text-[9px] text-amber-400">
                                          *
                                        </span>
                                      )}
                                    </label>
                                  );
                                })}
                            </div>

                            <div className="mt-4 flex items-center gap-3">
                              <label className="text-xs font-semibold text-slate-300">
                                SLA threshold (days):
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={s.currentSla ?? ""}
                                onChange={(e) =>
                                  updateSla(s.state, e.target.value)
                                }
                                placeholder="None"
                                className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-slate-200"
                              />
                              {s.currentSla !== s.defaultSla && (
                                <span className="text-[10px] text-amber-400">
                                  * default: {s.defaultSla ?? "none"}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "sla" && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Default (days)</th>
                <th className="px-3 py-2 font-medium">Current (days)</th>
                <th className="px-3 py-2 font-medium">Active Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((s) => (
                <tr
                  key={s.state}
                  className={cn(
                    "transition hover:bg-muted/30",
                    s.disabled && "opacity-40",
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          COLOR_CLASSES[s.color] ?? COLOR_CLASSES.slate,
                        )}
                      >
                        {s.state}
                      </span>
                      <span className="text-slate-300">{s.label}</span>
                      {s.currentSla !== s.defaultSla && (
                        <span className="text-amber-400">*</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">
                    {s.defaultSla !== null ? `${s.defaultSla}d` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={s.currentSla ?? ""}
                      onChange={(e) => updateSla(s.state, e.target.value)}
                      placeholder="None"
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-slate-200"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">
                    {s.activeTickets > 0 ? s.activeTickets : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Save configuration
        </button>
        <span className="text-xs text-muted-foreground">
          * indicates a change from defaults
        </span>
      </div>
    </div>
  );
}

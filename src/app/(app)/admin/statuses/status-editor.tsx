"use client";

import { useState } from "react";
import type { TicketState } from "@prisma/client";
import { cn } from "@/lib/cn";

interface StateInfo {
  state: TicketState;
  label: string;
  color: string;
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

  function handleSave() {
    // Build config from current state
    const transitions: Record<string, string[]> = {};
    const sla: Record<string, number | null> = {};
    const disabled: string[] = [];

    for (const s of data) {
      // Only store transitions that differ from defaults
      const defaultSet = new Set(s.defaultTransitions);
      const currentSet = new Set(s.currentTransitions);
      const isDiff =
        defaultSet.size !== currentSet.size ||
        [...defaultSet].some((t) => !currentSet.has(t));
      if (isDiff) {
        transitions[s.state] = s.currentTransitions;
      }

      // Only store SLA that differs from default
      if (s.currentSla !== s.defaultSla) {
        sla[s.state] = s.currentSla;
      }

      if (s.disabled) {
        disabled.push(s.state);
      }
    }

    const config = { transitions, sla, disabled };
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
    return transDiff || s.currentSla !== s.defaultSla || s.disabled;
  }

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-surface-border bg-surface-muted/60 p-1">
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === "list"
              ? "bg-accent text-white"
              : "text-slate-300 hover:bg-surface-border/40 hover:text-white",
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
              ? "bg-accent text-white"
              : "text-slate-300 hover:bg-surface-border/40 hover:text-white",
          )}
        >
          SLA Thresholds
        </button>
      </div>

      {view === "list" && (
        <div className="space-y-6">
          {stageGroups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.states.map((stateKey) => {
                  const s = data.find((d) => d.state === stateKey)!;
                  const expanded = expandedState === stateKey;
                  const modified = isModified(s);

                  return (
                    <div
                      key={stateKey}
                      className={cn(
                        "rounded-lg border transition",
                        s.disabled
                          ? "border-surface-border/50 bg-surface-muted/20 opacity-60"
                          : "border-surface-border bg-surface-muted",
                      )}
                    >
                      {/* State header row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* State pill */}
                        <span
                          className={cn(
                            "inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                            COLOR_CLASSES[s.color] ?? COLOR_CLASSES.slate,
                          )}
                        >
                          {s.state}
                        </span>

                        {/* Label */}
                        <span className="text-sm font-medium text-slate-200">
                          {s.label}
                          {modified && (
                            <span className="ml-1 text-amber-400">*</span>
                          )}
                        </span>

                        {/* Badges */}
                        <div className="flex items-center gap-2 ml-auto">
                          {s.activeTickets > 0 && (
                            <span className="rounded bg-surface-border px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
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

                          {/* Enable/Disable toggle */}
                          <button
                            type="button"
                            onClick={() => toggleDisabled(stateKey)}
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

                          {/* Expand/collapse */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedState(expanded ? null : stateKey)
                            }
                            className="rounded p-1 text-slate-400 transition hover:bg-surface-border hover:text-white"
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

                      {/* Expanded: transition editor */}
                      {expanded && (
                        <div className="border-t border-surface-border px-4 py-4">
                          <div className="mb-3 flex items-center gap-4">
                            <h4 className="text-xs font-semibold text-slate-300">
                              Allowed transitions from {s.label}
                            </h4>
                            <span className="text-[10px] text-slate-500">
                              Click to toggle. Checked states are reachable from
                              this state.
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                            {allStates
                              .filter((t) => t !== stateKey)
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
                                        ? "bg-accent/10 text-slate-200"
                                        : "text-slate-500 hover:bg-surface-border/30 hover:text-slate-300",
                                      targetData.disabled && "opacity-40",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleTransition(stateKey, target)
                                      }
                                      className="h-3.5 w-3.5 accent-accent"
                                    />
                                    <span>
                                      {
                                        data.find((d) => d.state === target)
                                          ?.label
                                      }
                                    </span>
                                    {checked !== isDefault && (
                                      <span className="text-[9px] text-amber-400">
                                        *
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                          </div>

                          {/* SLA inline edit */}
                          <div className="mt-4 flex items-center gap-3">
                            <label className="text-xs font-semibold text-slate-300">
                              SLA threshold (days):
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={s.currentSla ?? ""}
                              onChange={(e) =>
                                updateSla(stateKey, e.target.value)
                              }
                              placeholder="None"
                              className="w-20 rounded border border-surface-border bg-surface px-2 py-1 text-sm text-slate-200"
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
          ))}
        </div>
      )}

      {view === "sla" && (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="min-w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Default (days)</th>
                <th className="px-3 py-2 font-medium">Current (days)</th>
                <th className="px-3 py-2 font-medium">Active Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.map((s) => (
                <tr
                  key={s.state}
                  className={cn(
                    "transition hover:bg-surface-muted/30",
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
                      className="w-20 rounded border border-surface-border bg-surface px-2 py-1 text-sm tabular-nums text-slate-200"
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
          className="rounded bg-accent px-4 py-2 text-sm font-semibold transition hover:bg-accent-strong"
        >
          Save configuration
        </button>
        <span className="text-xs text-slate-500">
          * indicates a change from defaults
        </span>
      </div>
    </div>
  );
}

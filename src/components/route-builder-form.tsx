"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { RouteMap } from "@/components/route-map";
import { ActionForm, emitToast } from "@/components/action-form";
import {
  buildRouteAction,
  previewRouteAction,
  type RoutePreview,
} from "@/server/actions/scheduling";

/**
 * Round-22 §3.3 — route builder with a preview step.
 *
 * "Optimize & save" used to be one irreversible click. Now the operator
 * picks jobs + driver, hits "Preview route", and sees the optimized stop
 * order on a map with an ordered legend, the estimated drive time (when a
 * routing provider is configured), and a plain-language note of what the
 * optimizer changed — THEN saves. Save stays the existing buildRouteAction
 * (it re-optimizes server-side, so the preview and the save agree).
 */

export interface BuilderJob {
  id: string;
  type: string;
  schoolName: string;
  schoolCode: string | null;
  ticketCount: number;
  hasCoords: boolean;
}

export interface BuilderDriver {
  id: string;
  name: string;
  role: string;
}

/**
 * Above this many candidate stops, pre-selecting everything stops
 * being a convenience and becomes a trap: the primary button would
 * build one route out of the whole city. Below it, the old
 * everything-checked behaviour is genuinely what the operator wants.
 */
const PRECHECK_MAX = 25;

export function RouteBuilderForm({
  isoDate,
  drivers,
  jobs,
  roleLabel,
  totalAvailable,
  scopeLabel = null,
}: {
  isoDate: string;
  drivers: BuilderDriver[];
  jobs: BuilderJob[];
  /** Server-formatted role labels keyed by driver id (humanise is server-side). */
  roleLabel: Record<string, string>;
  /** Unscheduled jobs matching the filters, before the display cap. */
  totalAvailable?: number;
  /** Borough the list is narrowed to, if any. */
  scopeLabel?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [pending, startTransition] = useTransition();

  const precheck = jobs.length <= PRECHECK_MAX;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(precheck ? jobs.map((j) => j.id) : []),
  );
  const total = totalAvailable ?? jobs.length;
  const truncated = total > jobs.length;

  function setAll(on: boolean) {
    setSelected(on ? new Set(jobs.map((j) => j.id)) : new Set());
    setPreview(null);
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  }

  function runPreview() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (fd.getAll("jobIds").length === 0) {
      emitToast("error", "Pick at least one stop to preview.");
      return;
    }
    startTransition(async () => {
      const result = await previewRouteAction(fd);
      setPreview(result);
      if (!result.ok && result.error) emitToast("error", result.error);
    });
  }

  return (
    <ActionForm action={buildRouteAction} className="space-y-6">
      {/* expose the underlying <form> node for the preview FormData snapshot */}
      <FormRefBridge formRef={formRef} />
      <div className="grid gap-4 rounded-lg border border-surface-border bg-surface-muted/60 p-4 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            Date
          </span>
          <input
            type="date"
            name="date"
            defaultValue={isoDate}
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            Assigned to
          </span>
          <select
            name="assigneeUserId"
            required
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Choose a driver…</option>
            {drivers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({roleLabel[u.id] ?? u.role})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            Vehicle (optional)
          </span>
          <input
            type="text"
            name="vehicleRef"
            placeholder="e.g. VAN-02"
            className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-muted/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Stops on this route
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* The count has to say what is SELECTED, not what is on
                screen — "412 staged" next to a button that builds a
                route is how you get a 412-stop route. */}
            <span className="text-xs text-slate-400" data-testid="staged-count">
              {selected.size} of {jobs.length} selected
              {truncated && (
                <>
                  {" "}
                  · showing {jobs.length} of {total.toLocaleString()}
                  {scopeLabel ? ` in ${scopeLabel}` : ""}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded border border-surface-border px-2 py-0.5 text-[11px] transition hover:border-accent"
            >
              Select all shown
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="rounded border border-surface-border px-2 py-0.5 text-[11px] transition hover:border-accent"
            >
              Select none
            </button>
          </div>
        </div>
        {truncated && (
          <p className="border-b border-surface-border bg-amber-500/5 px-4 py-2 text-xs text-amber-200">
            {total.toLocaleString()} jobs are unscheduled
            {scopeLabel ? ` in ${scopeLabel}` : " across every borough"}. Only
            the {jobs.length} oldest are shown — narrow by borough or job type
            to see the rest. A route is one driver&apos;s day, so build it from
            one area at a time.
          </p>
        )}
        <ul className="divide-y divide-surface-border">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                name="jobIds"
                value={j.id}
                checked={selected.has(j.id)}
                aria-label={`Include ${j.schoolName}`}
                className="mt-1 h-4 w-4 accent-accent"
                onChange={() => toggle(j.id)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="rounded bg-surface-border px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase">
                    {j.type}
                  </span>
                  <span>{j.schoolName}</span>
                  {j.schoolCode && (
                    <span className="font-medium tracking-tight text-xs text-slate-500">
                      {j.schoolCode}
                    </span>
                  )}
                  {!j.hasCoords && (
                    <span
                      title="School has no coordinates — this job is appended in insertion order."
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200"
                    >
                      no coords
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {j.ticketCount} ticket{j.ticketCount === 1 ? "" : "s"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Preview panel */}
      {preview?.ok && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Preview — optimized order
            </h2>
            <span className="text-xs text-slate-400">
              {preview.changed ? "reordered" : "unchanged"}
            </span>
          </div>
          <p className="mb-3 text-xs text-slate-300">{preview.summary}</p>
          <RouteMap
            stops={preview.stops.map((s) => ({
              ...s,
              sublabel: s.sublabel ?? undefined,
            }))}
            title="Preview"
            roadRoute={preview.roadRoute}
          />
          <ol className="mt-3 space-y-1 text-xs">
            {preview.stops.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                  {s.sequence}
                </span>
                <span className="text-slate-200">{s.label}</span>
                {s.sublabel && (
                  <span className="text-slate-500">{s.sublabel}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending}
          className="rounded border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {pending ? "Optimizing…" : "Preview route"}
        </button>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
        >
          {preview?.ok ? "Save route" : "Optimize & save route"}
        </button>
        <Link
          href="/scheduling"
          className="rounded border border-surface-border px-4 py-2 text-sm text-slate-300 hover:border-accent"
        >
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}

/**
 * ActionForm renders its own <form>; grab that node for the preview
 * FormData snapshot via the nearest form ancestor of this marker.
 */
function FormRefBridge({
  formRef,
}: {
  formRef: React.MutableRefObject<HTMLFormElement | null>;
}) {
  return (
    <span
      aria-hidden="true"
      ref={(node) => {
        formRef.current = node?.closest("form") ?? null;
      }}
    />
  );
}

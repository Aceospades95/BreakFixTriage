"use client";

import { useState } from "react";
import { HolidayScope } from "@prisma/client";

/**
 * Round-10 §1D — scope ↔ district pair as a client island so the
 * District select disables when Scope = Global. Server-rendered
 * version had a "(when scope = district)" programmer-notation
 * label and an always-enabled select; this widget improves both.
 */
export function ScopeAndDistrict({
  districts,
}: {
  districts: { id: string; name: string }[];
}) {
  const [scope, setScope] = useState<HolidayScope>(HolidayScope.GLOBAL);
  const isDistrict = scope === HolidayScope.DISTRICT;
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-slate-400">
          Scope
        </span>
        <select
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as HolidayScope)}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        >
          <option value={HolidayScope.GLOBAL}>Global</option>
          <option value={HolidayScope.DISTRICT}>District</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-slate-400">
          District
        </span>
        <select
          name="scopeId"
          disabled={!isDistrict}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">—</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-slate-500">
          Required when the holiday only applies to a specific district.
        </span>
      </label>
    </>
  );
}

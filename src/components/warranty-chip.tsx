import { warrantyStatus } from "@/lib/warranty";

/**
 * Round-22 (demo feedback) — warranty status at a glance, so nobody
 * schedules a pickup for a device we'd just have to send back.
 */
export function WarrantyChip({
  warrantyExpires,
  compact = false,
}: {
  warrantyExpires: Date | null | undefined;
  compact?: boolean;
}) {
  const status = warrantyStatus(warrantyExpires);
  const date =
    status.kind === "in"
      ? status.expires.toISOString().slice(0, 10)
      : status.kind === "out"
        ? status.expired.toISOString().slice(0, 10)
        : null;

  const cls =
    status.kind === "in"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : status.kind === "out"
        ? "border-red-500/50 bg-red-500/15 text-red-200"
        : "border-surface-border bg-surface-muted text-slate-400";

  const label =
    status.kind === "in"
      ? compact
        ? "In warranty"
        : `In warranty until ${date}`
      : status.kind === "out"
        ? compact
          ? "Out of warranty"
          : `Out of warranty since ${date}`
        : compact
          ? "Warranty unknown"
          : "No warranty date on file";

  return (
    <span
      data-testid="warranty-chip"
      title={
        status.kind === "out"
          ? `Warranty expired ${date}. Check before picking this device up — out-of-warranty pickups get sent back.`
          : status.kind === "in"
            ? `Warranty runs until ${date}.`
            : "Add a warranty date on the device record to enable the pickup check."
      }
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

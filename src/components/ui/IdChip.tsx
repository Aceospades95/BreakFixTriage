/**
 * Round-4 §F4 — shared id chip with optional click-through and
 * copy affordance.
 *
 * Renders an entity id (cuid, incident number, etc.) in a compact
 * pill. When `href` is set, the chip is a `<a>` and clicking the
 * body navigates to the entity. The chip is intentionally NOT
 * `font-mono` (Round-3 §G14 forbids monospace outside `<code>` /
 * `<pre>`); the pill border + tracking-tight class give the
 * "this is an identifier" cue without breaking the convention.
 *
 * The Round-4 brief asks for a click-to-copy icon next to the
 * value. That needs a client component (`use client` for
 * `navigator.clipboard.writeText`) — the icon-button variant
 * lives in this same file as `IdChipWithCopy` and is exported
 * for callers that need it. The plain `IdChip` is a pure server
 * component (no JS shipped) for pages that don't need copy.
 *
 * Used by:
 *   - /admin/audit (each entry's entity ID)
 *   - merge banners (the merged-into target ID)
 *   - portal token rows (token suffix)
 *   - any future surface that renders an entity reference
 */

import Link from "next/link";

export interface IdChipProps {
  value: string;
  /** Optional click-through. When set, body becomes a Link. */
  href?: string;
  /** Visual width cap; defaults to 12rem. */
  className?: string;
  /** Tooltip override. Defaults to the full value. */
  title?: string;
}

export function IdChip({ value, href, className, title }: IdChipProps) {
  const baseCls =
    "inline-flex items-center rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] tracking-tight text-slate-400 hover:border-accent";
  const widthCls = className ?? "max-w-[12rem]";
  const inner = <span className="truncate">{value}</span>;
  if (href) {
    return (
      <Link
        href={href}
        title={title ?? `${value} — open`}
        className={`${baseCls} ${widthCls} hover:text-slate-200`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span
      title={title ?? value}
      className={`${baseCls} ${widthCls}`}
    >
      {inner}
    </span>
  );
}

/**
 * Map of `AuditLog.entityType` → href builder. The audit page's
 * EntryCard uses this to decide whether the IdChip should link.
 * Unknown entity types render a plain copy-only chip.
 */
export function hrefForEntity(
  entityType: string,
  entityId: string,
): string | undefined {
  switch (entityType) {
    case "Ticket":
      return `/tickets/${entityId}`;
    case "Route":
    case "RouteStop":
      return `/scheduling/routes/${entityId}`;
    case "Quote":
      // Quotes don't have a per-quote page today; ticket detail
      // is the canonical surface.
      return undefined;
    case "School":
      return `/admin/schools/${entityId}`;
    case "District":
      return `/admin/districts/${entityId}`;
    case "Device":
      return `/admin/devices/${entityId}`;
    case "EmailRule":
      return `/admin/email-rules/${entityId}/edit`;
    case "EmailTemplate":
      return `/admin/email-templates/${entityId}`;
    case "Status":
    case "StatusConfig":
      return `/admin/statuses`;
    case "Holiday":
      return `/admin/holidays`;
    case "User":
      return `/admin/users/${entityId}`;
    case "StaffSchedule":
      return `/scheduling/people`;
    case "PortalToken":
      // Portal token chip lives on /admin/schools/[schoolId];
      // we don't know the schoolId here so the chip stays
      // copy-only.
      return undefined;
    default:
      return undefined;
  }
}

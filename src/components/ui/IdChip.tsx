/**
 * Round-4 §F4 + Round-6 §2E — shared id chip with optional
 * click-through and copy affordance.
 *
 * Renders an entity id (cuid, incident number, etc.) in a compact
 * pill. When `href` is set, the chip body is a `<Link>` and clicking
 * navigates. When `copyValue` is set, a small copy-icon button
 * sits on the right; clicking the icon copies to the clipboard and
 * does NOT navigate (Round-6 §2E acceptance).
 *
 * The chip is intentionally NOT `font-mono` — Round-3 §G14 forbids
 * monospace outside <code>/<pre>; the pill border + tracking
 * provide the "this is an identifier" cue without breaking the
 * convention.
 *
 * Variants:
 *   - <IdChip>          — pure server component, no JS shipped.
 *                         No copy affordance.
 *   - <IdChipWithCopy>  — client component with a copy-icon button.
 *                         Use when the value is worth copying
 *                         (cuids in audit log entries, recipient
 *                         emails, etc.).
 *
 * Used by:
 *   - /admin/audit (every entry's entity id, with copy)
 *   - merge banners (the merged-into target id)
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
 * Round-6 §2E — context object passed to `hrefForEntity` so it can
 * build canonical URLs that don't have the right id in `entityId`
 * alone. Examples:
 *
 *   - Ticket audit rows store the cuid in `entityId`; the canonical
 *     URL is `/tickets/{incidentNumber}` so the user-friendly INC#
 *     shows in the address bar (Round-5 §2.11 redirect resolves
 *     INC → cuid for us).
 *   - RouteStop audit rows store the stop cuid in `entityId`; the
 *     canonical URL is `/scheduling/routes/{routeId}#stop-{stopId}`,
 *     and `routeId` lives in `after.routeId` per Round-6 §2A/§2E.
 *   - PortalToken audit rows store the token cuid; the canonical
 *     URL is `/admin/schools/{schoolId}#portal`, and `schoolId`
 *     lives in `after.schoolId`.
 *
 * `routeId`, `incidentNumber`, `schoolId` are pulled from the
 * audit row's `after` JSON by the audit page renderer.
 */
export interface EntityHrefContext {
  routeId?: string;
  incidentNumber?: string;
  schoolId?: string;
}

/**
 * Map of `AuditLog.entityType` → href builder. The audit page's
 * EntryCard uses this to decide whether the IdChip should link.
 * Unknown entity types render a plain copy-only chip.
 */
export function hrefForEntity(
  entityType: string,
  entityId: string,
  ctx: EntityHrefContext = {},
): string | undefined {
  switch (entityType) {
    case "Ticket":
      // Round-6 §2E — prefer the incident number so the URL is
      // human-readable. Round-5 §2.11 redirect resolves SYN- /
      // INC- shaped paths back to the cuid URL.
      return `/tickets/${ctx.incidentNumber ?? entityId}`;
    case "Route":
      return `/scheduling/routes/${entityId}`;
    case "RouteStop":
      // Round-6 §2E — link to the parent route, scrolling to
      // the stop anchor. Falls back to no-link when the audit
      // row predates the routeId-in-after convention.
      return ctx.routeId
        ? `/scheduling/routes/${ctx.routeId}#stop-${entityId}`
        : undefined;
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
      return `/scheduling/people?scheduleId=${entityId}`;
    case "PortalToken":
      // Round-6 §2E — schoolId lives in audit `after.schoolId`.
      return ctx.schoolId
        ? `/admin/schools/${ctx.schoolId}#portal`
        : undefined;
    default:
      return undefined;
  }
}

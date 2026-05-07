/**
 * Round-8 §3D — single canonical surface for humanise helpers.
 *
 * Existing code imports from `lib/format` (humanise, formatRole,
 * formatPriority, formatStatus, formatSource, humaniseEntity) and
 * from `lib/audit/format` (formatAuditAction). This module
 * re-exports them under the names the §3D brief specifies plus
 * adds `humanizePermission` for the permission-slug → friendly
 * label mapping that lives ad-hoc on /admin/permissions today.
 *
 * Keeping the implementations in their existing modules avoids a
 * codemod blast-radius (every page already imports from
 * lib/format); new code can pick either entry point.
 *
 * The forbidden-tokens grep gate (Round-6 §3C, extended in Round-7
 * + Round-8) enforces no raw enum render in JSX text — adding a
 * new humanise helper means routing through one of the four
 * exports below or extending the gate's hardcoded list.
 */

import type { Role, TicketPriority, TicketState } from "@prisma/client";
import { humaniseEnum } from "@/lib/cn";
import {
  formatPriority,
  formatRole,
  formatSource,
  formatStatus,
  humanise,
  humaniseEntity,
} from "@/lib/format";
import { formatAuditAction } from "@/lib/audit/format";

/**
 * Display-form for a Role (e.g. "OPS_MANAGER" → "Ops manager").
 * Re-exported from `lib/format` under the §3D brief name.
 */
export const humanizeRole = (role: Role): string => formatRole(role);

/**
 * Display-form for a TicketState (e.g. "PENDING_PICKUP_UNLINKED"
 * → "Pending pickup unlinked"). The /admin/statuses configurable
 * label store may override per-state — `lib/workflow/status-config`
 * is the canonical place to pull from when a config is loaded.
 */
export const humanizeState = (state: TicketState): string =>
  formatStatus(state);

/**
 * Display-form for a TicketPriority (e.g. "NORMAL" → "Normal").
 */
export const humanizePriority = (priority: TicketPriority): string =>
  formatPriority(priority);

/**
 * Display-form for an audit action slug (e.g. "transition:IMPORTED
 * ->TRIAGE" → "Imported → Triage"). Round-8 §1C ensures dotted +
 * stop-status forms also humanise correctly.
 */
export const humanizeAction = (action: string): string =>
  formatAuditAction(action).label;

/**
 * Display-form for a TicketSource tag (e.g. "ROUTE_PICKUP" →
 * "Route pickup"). Pure pass-through to humaniseEnum.
 */
export const humanizeSource = (source: string): string => formatSource(source);

/**
 * Display-form for a Prisma model name (e.g. "RouteStop" →
 * "Route stop"). Round-6 §2B added this; re-exported here.
 */
export const humanizeEntity = (entityType: string): string =>
  humaniseEntity(entityType);

/**
 * Round-8 §3D — display-form for a permission slug (e.g.
 * "tickets:write" → "Tickets · Write"). Used by /admin/permissions
 * and any future surface that lists permissions for an audit /
 * preview.
 *
 * Permission slugs are documented as `<group>:<action>` pairs in
 * lib/auth/rbac.ts. The mapper splits on the colon, humanises
 * each side, and joins with a middle dot so operators read
 * "Tickets · Write" not "tickets:write".
 */
export function humanizePermission(slug: string): string {
  const parts = slug.split(":");
  if (parts.length !== 2) return humaniseEnum(slug);
  const [group, action] = parts as [string, string];
  const groupLabel =
    group.charAt(0).toUpperCase() + group.slice(1).toLowerCase();
  const actionLabel = humaniseEnum(action.replace(/_/g, " ").toUpperCase());
  return `${groupLabel} · ${actionLabel}`;
}

export { humanise, humaniseEnum };

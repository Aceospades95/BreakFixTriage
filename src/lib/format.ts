/**
 * Centralised display-string formatters.
 *
 * Round-3 §G. Single import surface so every component renders
 * enum values, role names, priority labels, and source tags
 * consistently.
 *
 *   import { humanise, formatRole } from "@/lib/format";
 *
 * The legacy `humaniseEnum` from `lib/cn.ts` stays as the
 * implementation; this file is a thin re-export plus a few
 * domain-specific wrappers (`formatRole`, `formatPriority`,
 * `formatSource`).
 *
 * Convention: callers MUST go through this module rather than
 * inlining `s.toLowerCase()` / `s.replace(/_/g, " ")`. The CI
 * scan in `tests/forbidden-tokens.test.ts` extends to flag any
 * `[A-Z]{2,}_[A-Z]+` pattern in user-facing strings; that test
 * trusts that every enum-rendering site lands here.
 */

import type { Role, TicketPriority, TicketState } from "@prisma/client";
import { humaniseEnum } from "@/lib/cn";

/**
 * Humanise an `ALL_CAPS_SNAKE` string to "Title case form" while
 * preserving documented acronyms (RMA, SLA, OOW, PO, SN, DBN,
 * NYC, ID). See `docs/ui-conventions.md` §2.
 */
export function humanise(value: string): string {
  return humaniseEnum(value);
}

/**
 * Display-form for a Role value. Same rule as `humanise` but
 * pinned to the Role enum so callers get type checking.
 */
export function formatRole(role: Role): string {
  return humaniseEnum(role);
}

/**
 * Display-form for a TicketPriority. Pinned for type safety.
 */
export function formatPriority(priority: TicketPriority): string {
  return humaniseEnum(priority);
}

/**
 * Display-form for a TicketState. Use when the caller has the
 * raw state and not the human-overridden label from
 * `StatusConfig.labels[state]`. The status pill component
 * already does the override-aware lookup.
 */
export function formatStatus(state: TicketState): string {
  return humaniseEnum(state);
}

/**
 * Display-form for a free-form "source" tag. Sources today
 * include `IMPORTED` (legacy), `SNOW` (ServiceNow webhook), and
 * `MANUAL`. Round-3 §C adds `PORTAL`.
 *
 * Accepts an arbitrary string so future sources don't need a
 * code change here.
 */
export function formatSource(source: string): string {
  return humaniseEnum(source);
}

/**
 * Round-6 §2B — humanise a Prisma model name (PascalCase /
 * camelCase) into a sentence-case English phrase.
 *
 *   humaniseEntity("RouteStop")     → "Route stop"
 *   humaniseEntity("StaffSchedule") → "Staff schedule"
 *   humaniseEntity("PortalToken")   → "Portal token"
 *   humaniseEntity("Ticket")        → "Ticket"
 *   humaniseEntity("EmailRule")     → "Email rule"
 *   humaniseEntity("User")          → "User"
 *
 * Splits on word boundaries (lowercase → uppercase, or
 * uppercase-followed-by-uppercase-then-lowercase for run-on
 * acronyms like `URLPath` → "URL path"). The first word is
 * capitalised; the rest are lowercased.
 *
 * Sibling to `humaniseEnum` (which targets ALL_CAPS_SNAKE) — keep
 * both, do not over-generalise. The audit page uses
 * `humaniseEntity` for the "on" column so PascalCase model names
 * stop rendering as `Routestop` / `Staffschedule`.
 */
export function humaniseEntity(value: string): string {
  if (!value) return value;
  const parts = value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))
    .join(" ");
}

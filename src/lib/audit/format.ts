/**
 * Audit-string formatter.
 *
 * Round-2 §13 / §25. Single source of truth for converting raw
 * audit `action` strings into human-readable chips. Reused across
 * /admin/audit, the ticket Event Timeline, and any future surface
 * that renders audit entries.
 *
 * Examples:
 *
 *   "transition:PENDING_DELIVERY->DELIVERY_SCHEDULED"
 *     → { kind: "transition", from: "Pending delivery", to: "Delivery scheduled" }
 *
 *   "transition:force:DIAGNOSIS->IN_REPAIR"
 *     → { kind: "transition", forced: true, from: "Diagnosis", to: "In repair" }
 *
 *   "email:dispatch:queued:ticket_created"
 *     → { kind: "email", phase: "queued", event: "ticket_created", label: "Email queued: ticket created" }
 *
 *   "auto-expire"
 *     → { kind: "generic", label: "Auto-expire" }
 *
 * The formatter never throws; unknown shapes fall through to a
 * generic chip with the raw string titlecased.
 */

import { humaniseEnum } from "@/lib/cn";

export interface FormattedAction {
  /** Short human-friendly label, suitable for a chip. */
  label: string;
  /** Coarse classification — useful for picking a chip color. */
  kind: "transition" | "email" | "create" | "update" | "delete" | "generic";
  /** Set when kind=transition and the change was forced. */
  forced?: boolean;
  /** Set for transitions: the lane the move started in. */
  from?: string;
  /** Set for transitions: the lane the move landed in. */
  to?: string;
  /** Set for email actions: queued | sent | failed | skipped. */
  phase?: string;
  /** Set for email actions: the EmailEvent that fired. */
  event?: string;
}

const TRANSITION_RE = /^transition:(force:)?([A-Z_]+)->([A-Z_]+)$/;
const EMAIL_RE = /^email:dispatch:([a-z]+):([a-z_]+)$/;

export function formatAuditAction(action: string): FormattedAction {
  const t = TRANSITION_RE.exec(action);
  if (t) {
    const forced = !!t[1];
    const from = humaniseEnum(t[2]!);
    const to = humaniseEnum(t[3]!);
    return {
      kind: "transition",
      forced,
      from,
      to,
      label: forced
        ? `Force change: ${from} → ${to}`
        : `${from} → ${to}`,
    };
  }

  const e = EMAIL_RE.exec(action);
  if (e) {
    const phase = e[1]!;
    const event = e[2]!;
    return {
      kind: "email",
      phase,
      event,
      label: `Email ${phase}: ${humaniseEnum(event).toLowerCase()}`,
    };
  }

  if (action === "create" || action === "update" || action === "delete") {
    return {
      kind: action,
      label: action.charAt(0).toUpperCase() + action.slice(1),
    };
  }

  // Heuristic: snake_case → Title Case sentence, hyphens stay.
  const friendly = action
    .split(/[:_]/)
    .map((p, i) =>
      i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase(),
    )
    .join(" ");
  return { kind: "generic", label: friendly };
}

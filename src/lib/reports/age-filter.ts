import type { Prisma } from "@prisma/client";

/**
 * Age filters for the ticket list, shared with the metrics that link
 * into it.
 *
 * These exist because the dashboards were emitting drill-through
 * links with parameters nothing read. `/tickets?ageDays=gte:30`
 * silently ignored the age and rendered every open ticket, so the KPI
 * card said 412 and the list one click away said 3,100. A link whose
 * destination contradicts the number that produced it is worse than
 * no link.
 *
 * The cutoff arithmetic here is the SAME arithmetic the metrics use
 * (agingTicketsCount, boroughRollup, importedBacklogCount) so the two
 * cannot disagree. Note the two conventions are deliberately
 * different and are not a typo:
 *
 *   - "aging" means MORE than N full days, so the cutoff is N+1 days.
 *   - the imported/no-triage backlog is defined against a flat
 *     threshold in milliseconds, so its cutoff is exactly N days.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cutoff for "open more than N full days" — matches agingTicketsCount. */
export function agingCutoff(thresholdDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - (thresholdDays + 1) * MS_PER_DAY);
}

/** Cutoff for "in the current state at least N days" — matches the backlog. */
export function stateAgeCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Parse a `gte:30` style param. Only the `gte:` form is accepted
 * because that is the only comparison the links emit; anything else
 * returns undefined so the filter is skipped rather than applied
 * wrongly.
 */
export function parseAgeDaysParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^gte:(\d{1,4})$/.exec(raw.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Parse a `YYYY-MM-DD` (or full ISO) date param, or undefined. */
export function parseDateParam(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * `?ageDays=gte:N` — open tickets reported more than N days ago.
 * Carries the open predicate itself, because "aging" is meaningless
 * for a closed ticket and the metric it mirrors is open-only.
 */
export function ageDaysWhere(
  raw: string | undefined,
  now: Date = new Date(),
): Prisma.TicketWhereInput | null {
  const days = parseAgeDaysParam(raw);
  if (days === undefined) return null;
  return {
    state: { not: "CLOSED" },
    reportedAt: { lte: agingCutoff(days, now) },
  };
}

/** `?stateAgeDays=gte:N` — sitting in the current state N+ days. */
export function stateAgeDaysWhere(
  raw: string | undefined,
  now: Date = new Date(),
): Prisma.TicketWhereInput | null {
  const days = parseAgeDaysParam(raw);
  if (days === undefined) return null;
  return { stateEnteredAt: { lt: stateAgeCutoff(days, now) } };
}

/** `?closedSince=YYYY-MM-DD` — closed on or after that instant. */
export function closedSinceWhere(
  raw: string | undefined,
): Prisma.TicketWhereInput | null {
  const from = parseDateParam(raw);
  if (!from) return null;
  return { state: "CLOSED", closedAt: { gte: from } };
}

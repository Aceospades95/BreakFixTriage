/**
 * Recipient resolver for the email-rules engine.
 *
 * Round-2 §3. Each EmailRule stores a JSON `recipients` blob shaped
 * like `{ to: Recipient[], cc: Recipient[], bcc: Recipient[] }`.
 * Each Recipient is a `{ kind, value? }` tagged union. This module
 * expands the kinds to actual email addresses, scoped by the
 * dispatch context (which ticket / school / route the event was on).
 *
 * Dedupe + lowercase + drop empties so a downstream send call gets a
 * clean address list. The resolver never throws; it returns empty
 * lists if a school has no opted-in contacts (caller decides whether
 * to skip the send or fall back to global Wynndalco).
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import {
  getWynndalcoTeamEmails,
  getEmailListSetting,
  LEADERSHIP_LIST_KEYS,
} from "@/lib/settings/settings";

export type RecipientKind =
  | "spoc"
  | "ticket_reporter"
  | "wynndalco_team"
  // Round-22 — leadership distribution lists (settings-backed).
  | "district_leadership"
  | "internal_leadership"
  | "prime_leadership"
  | "literal";

/** Recipient kinds that are valid to store on a rule. */
export const RECIPIENT_KINDS: RecipientKind[] = [
  "spoc",
  "ticket_reporter",
  "wynndalco_team",
  "district_leadership",
  "internal_leadership",
  "prime_leadership",
  "literal",
];

/** Human label for each recipient kind (operator-facing copy). */
export const RECIPIENT_KIND_LABELS: Record<RecipientKind, string> = {
  spoc: "School SPOC contacts",
  ticket_reporter: "Ticket reporter",
  wynndalco_team: "Internal team list",
  district_leadership: "District leadership",
  internal_leadership: "Internal leadership",
  prime_leadership: "Prime-contract leadership",
  literal: "Specific address",
};

export interface Recipient {
  kind: RecipientKind;
  /**
   * For `literal` kind, the email address to add verbatim.
   * For `spoc`, optionally a comma-separated list of contact roles
   * to filter to (currently unused; future-proofing). Ignored
   * otherwise.
   */
  value?: string;
}

export interface RecipientSet {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
}

/**
 * Context the recipient resolver needs. Pass whatever is relevant to
 * the event being dispatched; missing fields just mean the
 * corresponding `kind` resolves to nothing.
 */
export interface RecipientContext {
  /** The ticket the event is on (drives `spoc` and `ticket_reporter`). */
  ticketId?: string;
  /** Pre-fetched ticket if the caller already has one. */
  ticket?: {
    id: string;
    schoolId: string;
    meta: unknown;
  } | null;
  /** Drives `spoc` if the event is school-scoped without a ticket. */
  schoolId?: string;
  /** Event family — gates which `receives*` flag on a Contact row counts. */
  family: "ticket" | "quote" | "delivery" | "internal";
}

/**
 * Map an event family to the SchoolContact column that opts a
 * contact in. `internal` events go only to the Wynndalco team list,
 * never to school contacts — see `wynndalco_team` resolution.
 */
function spocFlagForFamily(
  family: RecipientContext["family"],
): "receivesTicketEmails" | "receivesQuoteEmails" | "receivesDeliveryReceipts" | null {
  switch (family) {
    case "ticket":
      return "receivesTicketEmails";
    case "quote":
      return "receivesQuoteEmails";
    case "delivery":
      return "receivesDeliveryReceipts";
    case "internal":
      return null;
  }
}

interface ResolvedAddresses {
  to: string[];
  cc: string[];
  bcc: string[];
}

/**
 * Expand a RecipientSet into deduped lowercased address lists.
 *
 * Returns empty `to` if no `to` recipient resolved to any address —
 * the caller must check this and skip the send (otherwise the SMTP
 * provider rejects the message).
 */
export async function resolveRecipients(
  set: RecipientSet,
  ctx: RecipientContext,
  db: PrismaClient = defaultPrisma,
): Promise<ResolvedAddresses> {
  const ticket =
    ctx.ticket ??
    (ctx.ticketId
      ? await db.ticket.findUnique({
          where: { id: ctx.ticketId },
          select: { id: true, schoolId: true, meta: true },
        })
      : null);

  const schoolId = ctx.schoolId ?? ticket?.schoolId ?? null;
  const flag = spocFlagForFamily(ctx.family);

  // Lazily fetch SPOC contacts only if at least one rule needs them.
  let spocCache: string[] | null = null;
  async function spocs(): Promise<string[]> {
    if (spocCache !== null) return spocCache;
    if (!schoolId || !flag) {
      spocCache = [];
      return spocCache;
    }
    const contacts = await db.contact.findMany({
      where: {
        schoolId,
        [flag]: true,
        email: { not: null },
      },
      select: { email: true },
    });
    spocCache = contacts
      .map((c) => c.email)
      .filter((e): e is string => typeof e === "string");
    return spocCache;
  }

  // Lazily fetch global team list.
  let teamCache: string[] | null = null;
  async function team(): Promise<string[]> {
    if (teamCache !== null) return teamCache;
    teamCache = await getWynndalcoTeamEmails(db);
    return teamCache;
  }

  // Round-22 — leadership lists, each fetched (and cached) on demand.
  const leadershipCache = new Map<string, string[]>();
  async function leadership(
    kind: keyof typeof LEADERSHIP_LIST_KEYS,
  ): Promise<string[]> {
    const cached = leadershipCache.get(kind);
    if (cached) return cached;
    const list = await getEmailListSetting(LEADERSHIP_LIST_KEYS[kind], db);
    leadershipCache.set(kind, list);
    return list;
  }

  // Lazily extract the ticket reporter's email from
  // ticket.meta.requesterEmail (set by the import pipeline).
  function reporterEmail(): string | null {
    const meta = ticket?.meta;
    if (!meta || typeof meta !== "object") return null;
    const v = (meta as Record<string, unknown>).requesterEmail;
    return typeof v === "string" && v.includes("@") ? v : null;
  }

  async function expand(rs: Recipient[]): Promise<string[]> {
    const out: string[] = [];
    for (const r of rs) {
      switch (r.kind) {
        case "spoc": {
          out.push(...(await spocs()));
          break;
        }
        case "ticket_reporter": {
          const e = reporterEmail();
          if (e) out.push(e);
          break;
        }
        case "wynndalco_team": {
          out.push(...(await team()));
          break;
        }
        case "district_leadership":
        case "internal_leadership":
        case "prime_leadership": {
          out.push(...(await leadership(r.kind)));
          break;
        }
        case "literal": {
          if (r.value && r.value.includes("@")) out.push(r.value);
          break;
        }
      }
    }
    return dedupeLowercase(out);
  }

  return {
    to: await expand(set.to),
    cc: await expand(set.cc),
    bcc: await expand(set.bcc),
  };
}

function dedupeLowercase(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addrs) {
    const norm = a.trim().toLowerCase();
    if (!norm || !norm.includes("@")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/**
 * Loose runtime validation of a stored RecipientSet. `EmailRule.recipients`
 * is a JSON column so we can't rely on TypeScript types. This validator
 * accepts well-shaped sets and rejects everything else (the rule's
 * admin form is the gate; this is defense-in-depth).
 */
export function isRecipientSet(value: unknown): value is RecipientSet {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.to) &&
    Array.isArray(v.cc) &&
    Array.isArray(v.bcc) &&
    [...v.to, ...v.cc, ...v.bcc].every(isRecipient)
  );
}

function isRecipient(v: unknown): v is Recipient {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.kind !== "string" || !RECIPIENT_KINDS.includes(r.kind as RecipientKind)) {
    return false;
  }
  if (r.value !== undefined && typeof r.value !== "string") return false;
  return true;
}

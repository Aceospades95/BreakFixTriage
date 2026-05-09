/**
 * Global search backend.
 *
 * Single entry point used by the header search bar. Runs one query
 * per entity type in parallel and merges the results into a flat
 * list of `SearchHit` records. Each hit carries the minimum the UI
 * needs to render a clickable row: kind, title, subtitle, href.
 *
 * Scope (Phase 6): tickets, schools, devices, contacts, users.
 * No fuzzy matching, no ranking — Postgres `ILIKE` is good enough
 * until the dataset outgrows ~50 k rows.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import type { BreakFixSession } from "@/lib/auth/session";
import {
  canSeeUserResults,
  contactWhereForSession,
  deviceWhereForSession,
  schoolWhereForSession,
  ticketWhereForSession,
} from "@/lib/data/forSession";

export type SearchHitKind =
  | "ticket"
  | "school"
  | "device"
  | "contact"
  | "user";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Minimum query length before we bother hitting the DB. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Hard cap per kind. Twenty per kind × 5 kinds = 100 max results,
 * which is enough to surface obvious matches without loading half
 * the table into memory for a stray single-char query.
 */
const PER_KIND_LIMIT = 20;

export interface GlobalSearchOptions {
  query: string;
  limit?: number;
  db?: PrismaClient;
  /**
   * Round-13 §1C — required tenant scope. Non-admins see only rows
   * permitted by their districtIds; user results require
   * USERS_MANAGE. Admins see everything.
   *
   * Optional for backwards compatibility with older callers that
   * skip the parameter (e.g. existing tests). When absent, the
   * function falls back to the unscoped legacy behaviour and emits
   * a console warning so production paths get fixed.
   */
  session?: BreakFixSession;
}

/**
 * Execute a global search. Returns an empty array for queries
 * shorter than `MIN_QUERY_LENGTH`, which is the UI's signal to
 * short-circuit drawing the dropdown.
 *
 * Round-13 §1C — when `session` is supplied, every entity query is
 * scoped by the actor's district memberships; admin URLs are
 * filtered out for non-admin actors; user results require the
 * USERS_MANAGE permission.
 */
export async function globalSearch(
  options: GlobalSearchOptions,
): Promise<SearchHit[]> {
  const q = options.query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const limit = options.limit ?? PER_KIND_LIMIT * 5;
  const db = options.db ?? defaultPrisma;
  const session = options.session;
  const isAdmin = session?.role === "ADMIN";

  if (!session) {
    console.warn(
      "[globalSearch] called without session — tenant scoping skipped. Pass a session to scope.",
    );
  }

  const ticketScope = session ? ticketWhereForSession(session) : {};
  const schoolScope = session ? schoolWhereForSession(session) : {};
  const deviceScope = session ? deviceWhereForSession(session) : {};
  const contactScope = session ? contactWhereForSession(session) : {};
  const includeUsers = session ? await canSeeUserResults(session) : true;

  const [tickets, schools, devices, contacts, users] = await Promise.all([
    db.ticket.findMany({
      where: {
        AND: [
          ticketScope,
          {
            OR: [
              { incidentNumber: { contains: q, mode: "insensitive" } },
              { shortDescription: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: PER_KIND_LIMIT,
      orderBy: { updatedAt: "desc" },
      include: { school: { select: { name: true, code: true } } },
    }),
    db.school.findMany({
      where: {
        AND: [
          schoolScope,
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: PER_KIND_LIMIT,
      orderBy: { name: "asc" },
      include: { district: { select: { name: true } } },
    }),
    db.device.findMany({
      where: {
        AND: [
          deviceScope,
          {
            OR: [
              { serialNumber: { contains: q, mode: "insensitive" } },
              { assetTag: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: PER_KIND_LIMIT,
      include: {
        school: { select: { name: true } },
        model: { select: { manufacturer: true, modelName: true } },
      },
    }),
    db.contact.findMany({
      where: {
        AND: [
          contactScope,
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: PER_KIND_LIMIT,
      include: { school: { select: { name: true } } },
    }),
    includeUsers
      ? db.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          take: PER_KIND_LIMIT,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as never[]),
  ]);

  const hits: SearchHit[] = [];

  // Use incidentNumber for ticket hrefs (the canonical URL shape
  // since R12 §1B). Admin URLs are filtered out for non-admin
  // actors so we don't leak the existence of /admin pages.
  for (const t of tickets) {
    hits.push({
      kind: "ticket",
      id: t.id,
      title: t.incidentNumber,
      subtitle: `${t.school.name} · ${t.state} · ${t.shortDescription}`,
      href: `/tickets/${t.incidentNumber}`,
    });
  }
  for (const s of schools) {
    hits.push({
      kind: "school",
      id: s.id,
      title: s.name,
      subtitle: [s.code, s.district.name].filter(Boolean).join(" · "),
      href: isAdmin ? `/admin/schools/${s.id}` : `/schools/${s.id}`,
    });
  }
  for (const d of devices) {
    const model = d.model
      ? `${d.model.manufacturer} ${d.model.modelName}`
      : "Unknown model";
    hits.push({
      kind: "device",
      id: d.id,
      title: d.serialNumber,
      subtitle: [d.assetTag, model, d.school?.name].filter(Boolean).join(" · "),
      href: isAdmin ? `/admin/devices/${d.id}` : `/devices/${d.id}`,
    });
  }
  for (const c of contacts) {
    hits.push({
      kind: "contact",
      id: c.id,
      title: c.name,
      subtitle: [c.email, c.phone, c.school.name]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/contacts`,
    });
  }
  if (includeUsers) {
    for (const u of users) {
      hits.push({
        kind: "user",
        id: u.id,
        title: u.name,
        subtitle: `${u.email} · ${u.role}`,
        href: `/admin/users/${u.id}`,
      });
    }
  }

  return hits.slice(0, limit);
}

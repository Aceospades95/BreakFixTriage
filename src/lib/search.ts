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
}

/**
 * Execute a global search. Returns an empty array for queries
 * shorter than `MIN_QUERY_LENGTH`, which is the UI's signal to
 * short-circuit drawing the dropdown.
 */
export async function globalSearch(
  options: GlobalSearchOptions,
): Promise<SearchHit[]> {
  const q = options.query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const limit = options.limit ?? PER_KIND_LIMIT * 5;
  const db = options.db ?? defaultPrisma;

  const [tickets, schools, devices, contacts, users] = await Promise.all([
    db.ticket.findMany({
      where: {
        OR: [
          { incidentNumber: { contains: q, mode: "insensitive" } },
          { shortDescription: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_LIMIT,
      orderBy: { updatedAt: "desc" },
      include: { school: { select: { name: true, code: true } } },
    }),
    db.school.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_LIMIT,
      orderBy: { name: "asc" },
      include: { district: { select: { name: true } } },
    }),
    db.device.findMany({
      where: {
        OR: [
          { serialNumber: { contains: q, mode: "insensitive" } },
          { assetTag: { contains: q, mode: "insensitive" } },
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
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_LIMIT,
      include: { school: { select: { name: true } } },
    }),
    db.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_LIMIT,
      orderBy: { name: "asc" },
    }),
  ]);

  const hits: SearchHit[] = [];

  for (const t of tickets) {
    hits.push({
      kind: "ticket",
      id: t.id,
      title: t.incidentNumber,
      subtitle: `${t.school.name} · ${t.state} · ${t.shortDescription}`,
      href: `/tickets/${t.id}`,
    });
  }
  for (const s of schools) {
    hits.push({
      kind: "school",
      id: s.id,
      title: s.name,
      subtitle: [s.code, s.district.name].filter(Boolean).join(" · "),
      href: `/admin/schools/${s.id}`,
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
      href: `/admin/devices/${d.id}`,
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
  for (const u of users) {
    hits.push({
      kind: "user",
      id: u.id,
      title: u.name,
      subtitle: `${u.email} · ${u.role}`,
      href: `/admin/users/${u.id}`,
    });
  }

  return hits.slice(0, limit);
}

import type { Prisma } from "@prisma/client";

/**
 * Borough / region layer for the five-borough expansion.
 *
 * The pilot ran in one borough, so every list was implicitly "the
 * whole operation" and a flat school dropdown was fine. Across all
 * five boroughs there are ~1,500 schools and ~32 community school
 * districts, and the first question anyone asks — dispatcher,
 * borough manager, or tech — is "which borough?".
 *
 * Where the answer lives:
 *   - `District.region` is the authoritative, admin-editable value.
 *     It is free text on purpose (this app is not NYC-only forever),
 *     so filter options are read from the data, never hardcoded.
 *   - NYC DBN school codes ("11X123") encode the borough in the
 *     third character, which gives us a reliable backfill for
 *     districts whose region was never filled in.
 *
 * Everything here is pure so it can be unit-tested without a DB.
 */

/** NYC DBN borough letters → borough names. */
export const DBN_BOROUGHS: Record<string, string> = {
  M: "Manhattan",
  X: "Bronx",
  K: "Brooklyn",
  Q: "Queens",
  R: "Staten Island",
};

/**
 * Borough for an NYC DBN school code. A DBN is two district digits,
 * one borough letter, then the school number — "11X123" is Bronx.
 * Returns null for anything that isn't DBN-shaped, so non-NYC
 * deployments simply get no inference.
 */
export function boroughFromDbn(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = /^\s*(\d{2})([MXKQR])\s*\d{2,4}\s*$/i.exec(code);
  if (!m) return null;
  return DBN_BOROUGHS[m[2]!.toUpperCase()] ?? null;
}

/** District number from a DBN ("11X123" → 11), or null. */
export function districtNumberFromDbn(
  code: string | null | undefined,
): number | null {
  if (!code) return null;
  const m = /^\s*(\d{2})([MXKQR])\s*\d{2,4}\s*$/i.exec(code);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * The borough shown for a school: the district's region when set,
 * otherwise inferred from the DBN. Keeps display consistent whether
 * or not an admin has filled the region in yet.
 */
export function boroughForSchool(school: {
  code?: string | null;
  district?: { region?: string | null } | null;
}): string | null {
  const region = school.district?.region?.trim();
  if (region) return region;
  return boroughFromDbn(school.code);
}

/**
 * Prisma filter for "tickets in this borough". Region lives on
 * District, so the path is Ticket → School → District. `region` is
 * matched case-insensitively because it is operator-typed text.
 *
 * Returns an empty object for a blank borough so callers can spread
 * it unconditionally.
 */
export function ticketWhereForBorough(
  borough: string | null | undefined,
): Prisma.TicketWhereInput {
  const b = borough?.trim();
  if (!b) return {};
  return { school: { district: { region: { equals: b, mode: "insensitive" } } } };
}

/** Same idea for school-rooted queries (devices, portal tokens…). */
export function schoolWhereForBorough(
  borough: string | null | undefined,
): Prisma.SchoolWhereInput {
  const b = borough?.trim();
  if (!b) return {};
  return { district: { region: { equals: b, mode: "insensitive" } } };
}

/** Prisma filter for "routes with at least one stop in this borough". */
export function routeWhereForBorough(
  borough: string | null | undefined,
): Prisma.RouteWhereInput {
  const b = borough?.trim();
  if (!b) return {};
  return {
    stops: {
      some: {
        job: { school: { district: { region: { equals: b, mode: "insensitive" } } } },
      },
    },
  };
}

/**
 * Sort helper so borough pickers read in a stable, familiar order
 * (NYC boroughs first in their conventional order, then anything
 * else alphabetically — a non-NYC region list still sorts sanely).
 */
const NYC_ORDER = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
export function sortBoroughs(regions: string[]): string[] {
  return [...regions].sort((a, b) => {
    const ia = NYC_ORDER.indexOf(a);
    const ib = NYC_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

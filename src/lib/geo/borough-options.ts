import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import type { BreakFixSession } from "@/lib/auth/session";
import { isAdmin } from "@/lib/data/forSession";
import { sortBoroughs } from "@/lib/geo/boroughs";

/**
 * The borough list every filter offers, read from the data.
 *
 * District.region is operator-editable free text on purpose (this app
 * should survive leaving NYC), so the options can never be a
 * hardcoded list of five. Every reporting surface calls this so they
 * all offer exactly the same set in the same order.
 *
 * Pass the session. A district-scoped user offered all five boroughs
 * can pick one they hold no districts in, and the page answers "0
 * everything" — which reads as "no work here", not "not yours". The
 * option list has to be the set of boroughs the actor can actually
 * see, so `districtScopeFor` narrows it for non-admins.
 */
export function districtScopeFor(
  session: BreakFixSession | undefined,
): Prisma.DistrictWhereInput {
  if (!session || isAdmin(session)) return {};
  return { id: { in: session.districtIds } };
}

/**
 * District ids the actor is limited to, or null for unrestricted.
 * Reports that count districts and schools (not just tickets) need
 * this: counting every district in the city while counting only the
 * actor's tickets produces rows like "Manhattan — 8 districts, 0
 * tickets", which is not a real answer.
 */
export function districtIdsFor(
  session: BreakFixSession | undefined,
): string[] | null {
  if (!session || isAdmin(session)) return null;
  return session.districtIds;
}

export async function boroughOptions(
  db: PrismaClient = defaultPrisma,
  session?: BreakFixSession,
): Promise<string[]> {
  const rows = await db.district.findMany({
    where: {
      active: true,
      region: { not: null },
      ...districtScopeFor(session),
    },
    distinct: ["region"],
    select: { region: true },
  });
  return sortBoroughs(
    rows.map((r) => r.region?.trim()).filter((r): r is string => Boolean(r)),
  );
}

/**
 * Normalise a `?borough=` param against the real option list.
 *
 * Returning undefined for anything unrecognised means a stale
 * bookmark or a hand-edited URL silently falls back to "all
 * boroughs" instead of rendering an empty report that looks like
 * zero work exists.
 */
export function normalizeBorough(
  raw: string | string[] | undefined,
  options: string[],
): string | undefined {
  const value = typeof raw === "string" ? raw.trim() : undefined;
  if (!value) return undefined;
  return options.find((o) => o.toLowerCase() === value.toLowerCase());
}

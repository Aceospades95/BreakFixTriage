import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Round-6 §1C — `/scheduling/routes` (plural) used to fall through to
 * the bare default Next 404 because no segment matched. Operators
 * who paste `/scheduling/routes` from memory got a chrome-less page.
 *
 * This file forces the unmatched path through Next's not-found
 * handler so the chromed `/not-found` (sidebar + topbar + "Common
 * destinations" grid) renders. See `docs/round-6-assumptions.md`
 * for the Option (a) vs (b) decision — we picked (b) because the
 * brief explicitly forbids scope expansion in this round and a real
 * route index belongs in a follow-up alongside list-page polish.
 */
export default function SchedulingRoutesIndex(): never {
  notFound();
}

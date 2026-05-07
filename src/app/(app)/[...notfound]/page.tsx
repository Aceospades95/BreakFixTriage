import { notFound } from "next/navigation";

/**
 * Round-7 §1B — top-level (app) catch-all so unmatched paths in
 * the operator app trigger the chromed `(app)/not-found.tsx`.
 *
 * Lowest match priority — every real route still wins. Sibling
 * `(app)/admin/[...notfound]/page.tsx` covers admin-scoped 404s
 * with the admin destination grid.
 */
export default function AppCatchAll(): never {
  notFound();
}

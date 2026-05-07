import { notFound } from "next/navigation";

/**
 * Round-7 §1B — admin catch-all that forces unmatched paths under
 * `/admin/*` through Next's not-found handler so the chromed
 * `(app)/admin/not-found.tsx` (sidebar + admin sub-nav + Common
 * destinations) renders instead of the bare default 404.
 *
 * Without this file, paths like `/admin/notifications` or
 * `/admin/foo` short-circuit straight to the bare Next.js 404.
 * The `[...notfound]` shape has the lowest match priority so any
 * real admin page (static or dynamic) still wins.
 */
export default function AdminCatchAll(): never {
  notFound();
}

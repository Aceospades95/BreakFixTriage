import { redirect } from "next/navigation";

/**
 * /audit is now a permanent redirect to /admin/audit (the canonical
 * URL for the audit log, per findings §3.A9). Old bookmarks /
 * external links keep working.
 *
 * Implementation note: the App Router's `redirect()` issues a 307
 * by default; that's fine for the alias. A 308 / `permanent: true`
 * isn't available without `next.config.mjs` redirects, which we
 * keep out of scope here.
 */
export default function AuditAlias({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = serialiseQuery(searchParams);
  redirect(qs ? `/admin/audit?${qs}` : "/admin/audit");
}

function serialiseQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  if (!searchParams) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, item);
    } else {
      sp.set(k, v);
    }
  }
  return sp.toString();
}

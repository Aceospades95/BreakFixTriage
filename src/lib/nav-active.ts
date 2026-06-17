/**
 * Round-22 §4 — nav active-state resolution.
 *
 * A nav item is "active" when the current path is it or under it — but
 * only the MOST SPECIFIC matching item lights up. Without the
 * specificity rule, /scheduling/people highlighted both "Scheduling"
 * (prefix match) and "People" (exact match). Pure + tested so the
 * sidebar and the top nav can't drift.
 */
export function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[],
): boolean {
  if (!pathMatchesHref(pathname, href)) return false;
  // Beaten by any longer href that also matches (the deeper route).
  return !allHrefs.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      pathMatchesHref(pathname, other),
  );
}

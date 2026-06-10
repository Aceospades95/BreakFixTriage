/**
 * Round-18 — feedback-param helper for server-action redirects.
 *
 * The bulk-action bug class: `redirect(`${returnTo}?ok=…`)` corrupts
 * the URL whenever returnTo already carries a query string (the
 * tickets list passes its current filters), producing
 * `…&assignee=?ok=Moved 2/2` — the action ran but the banner never
 * rendered, so operators concluded the button did nothing.
 */
export function withFeedback(
  path: string,
  kind: "ok" | "error",
  message: string,
): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${kind}=${encodeURIComponent(message)}`;
}

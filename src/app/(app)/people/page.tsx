import { redirect } from "next/navigation";

/**
 * Round-13 §1A — /people redirects to /scheduling/people.
 *
 * The sidebar's "People" item targets /scheduling/people (the
 * actual schedule grid), but operators who type the natural
 * shortcut /people landed on the chromed 404. This redirect
 * makes both the sidebar click and the direct URL resolve.
 *
 * Conceptual room for /people to graduate into a directory of
 * people that links into multiple surfaces (scheduling, profile,
 * audit-by-actor) is left as a Round-14 entrypoint. For now it's
 * a clean 308 to the only people-shaped surface that exists.
 *
 * Decision documented in docs/round-13-decisions.md.
 */
export default function PeopleRedirect(): never {
  redirect("/scheduling/people");
}

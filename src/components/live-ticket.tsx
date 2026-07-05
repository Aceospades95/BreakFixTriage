"use client";

import { useAppEvents } from "./use-app-events";

/**
 * Round-2 QA audit — keep an open ticket detail page live. Subscribes
 * to the tickets.changed SSE topic and refreshes the route when any
 * ticket changes, so a second session's save shows up here within a
 * second instead of the tab displaying stale values until a manual
 * reload. Renders nothing.
 *
 * Uncontrolled form inputs keep their in-progress values across a
 * router.refresh(), so an operator mid-edit doesn't lose typing —
 * and if they submit anyway, the server-side stale-write check on
 * updateTicketAction is the real backstop.
 */
export function LiveTicket() {
  useAppEvents(["tickets.changed"]);
  return null;
}

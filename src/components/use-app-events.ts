"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client hook that subscribes to the server's SSE event stream and
 * refreshes the current route when matching events arrive.
 *
 * Usage:
 *   useAppEvents(["tickets.changed", "tickets.bulk-changed"]);
 *
 * The hook opens a single `EventSource` against `/api/events`, parses
 * every incoming message as an `AppEvent`, and calls
 * `router.refresh()` whenever the event's `topic` is in the caller's
 * allow list. It also debounces bursts — if 10 transitions fire
 * within a second, we only refresh once — so the UI stays snappy.
 *
 * Failure mode: the browser's native EventSource auto-reconnects.
 * If the stream errors (network blip, proxy idle kill), the server
 * already sends a `retry: 5000` hint and the browser handles the
 * reconnect. We log errors but never throw.
 */

// Shape must match src/lib/events/bus.ts -> AppEvent.
type Topic =
  | "tickets.changed"
  | "tickets.bulk-changed"
  | "routes.changed"
  | "notifications.new";

interface WireEvent {
  topic: Topic;
  [extra: string]: unknown;
}

export function useAppEvents(
  topics: Topic[],
  options: { debounceMs?: number } = {},
): void {
  const router = useRouter();
  const debounceMs = options.debounceMs ?? 400;

  useEffect(() => {
    // Guard against environments without EventSource (SSR, old browsers).
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const wanted = new Set(topics);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const source = new EventSource("/api/events");

    const onMessage = (msg: MessageEvent<string>) => {
      let parsed: WireEvent | null = null;
      try {
        parsed = JSON.parse(msg.data) as WireEvent;
      } catch {
        // Malformed event — ignore.
        return;
      }
      if (!parsed || !wanted.has(parsed.topic)) return;

      // Debounce bursts of events into a single refresh.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        router.refresh();
        timer = null;
      }, debounceMs);
    };

    const onError = () => {
      // EventSource auto-reconnects on its own; no action needed.
    };

    source.addEventListener("message", onMessage);
    source.addEventListener("error", onError);

    return () => {
      if (timer) clearTimeout(timer);
      source.removeEventListener("message", onMessage);
      source.removeEventListener("error", onError);
      source.close();
    };
    // topics is rebuilt each render but its content is stable for
    // typical usage — serialize to a stable string for the dep key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, topics.join("|"), debounceMs]);
}

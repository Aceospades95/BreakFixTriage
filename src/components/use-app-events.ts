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
 * Round-5 QA audit — ONE EventSource per browser tab, shared by
 * every mounted subscriber. Previously each hook instance opened
 * its own connection, so a page mounting several live components
 * held several sockets, and every socket occupies a slot in the
 * reverse proxy's connection budget for as long as the tab lives.
 * The stream closes when the last subscriber unmounts.
 *
 * Failure mode: the browser's native EventSource auto-reconnects.
 * If the stream errors (network blip, proxy idle kill), the server
 * already sends a `retry: 5000` hint and the browser handles the
 * reconnect. We log nothing and never throw.
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

type Listener = (event: WireEvent) => void;

let shared: EventSource | null = null;
const listeners = new Set<Listener>();

function acquireStream(listener: Listener): () => void {
  listeners.add(listener);
  if (!shared && typeof EventSource !== "undefined") {
    shared = new EventSource("/api/events");
    shared.addEventListener("message", (msg: MessageEvent<string>) => {
      let parsed: WireEvent | null = null;
      try {
        parsed = JSON.parse(msg.data) as WireEvent;
      } catch {
        return; // malformed event — ignore
      }
      if (!parsed) return;
      for (const l of listeners) l(parsed);
    });
    // EventSource auto-reconnects on error; nothing to do.
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && shared) {
      shared.close();
      shared = null;
    }
  };
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

    const release = acquireStream((event) => {
      if (!wanted.has(event.topic)) return;
      // Debounce bursts of events into a single refresh.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        router.refresh();
        timer = null;
      }, debounceMs);
    });

    return () => {
      if (timer) clearTimeout(timer);
      release();
    };
    // topics is rebuilt each render but its content is stable for
    // typical usage — serialize to a stable string for the dep key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, topics.join("|"), debounceMs]);
}

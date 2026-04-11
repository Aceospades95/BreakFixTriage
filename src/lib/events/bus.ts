/**
 * Tiny in-process event bus for SSE.
 *
 * Publish/subscribe around a Node `EventEmitter`. Single-process
 * only — if you scale BreakFix Triage to multiple replicas, swap
 * this for Postgres `LISTEN`/`NOTIFY` or Redis pub/sub. Today we
 * run a single `next start` container, so in-process is fine.
 *
 * Topics are just strings. The convention is `tickets.*`,
 * `routes.*`, etc. Subscribers receive the full payload; filtering
 * is the subscriber's job.
 *
 * Kept in a module-level singleton so every API route and every
 * server action writes to the same instance. In dev-mode hot
 * reloads would otherwise construct a new emitter on each edit;
 * we stash it on `globalThis` the same way the Prisma client does
 * to survive HMR.
 */

import { EventEmitter } from "node:events";

export type AppEvent =
  | { topic: "tickets.changed"; ticketId: string }
  | { topic: "tickets.bulk-changed"; reason: string }
  | { topic: "routes.changed"; routeId: string }
  | { topic: "notifications.new"; recipientUserId: string };

interface GlobalWithBus {
  bftEventBus?: EventEmitter;
}

const globalForBus = globalThis as unknown as GlobalWithBus;
const emitter: EventEmitter =
  globalForBus.bftEventBus ?? new EventEmitter();
if (!globalForBus.bftEventBus) {
  // Next's dev mode HMR re-imports modules — reuse the same
  // emitter so reloaded modules stay connected.
  globalForBus.bftEventBus = emitter;
  // Leave plenty of headroom for many concurrent SSE streams.
  emitter.setMaxListeners(200);
}

const CHANNEL = "app.event";

export function publish(event: AppEvent): void {
  emitter.emit(CHANNEL, event);
}

export function subscribe(listener: (event: AppEvent) => void): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}

/**
 * In-memory rate limiter for auth-sensitive endpoints.
 *
 * Simple sliding window over a Map. Not distributed — if you run
 * multiple replicas, each replica enforces its own limit, which
 * means the effective limit is `N * replicas`. Acceptable for a
 * single-site break-fix operation; swap for Redis when you need
 * to scale horizontally.
 *
 * Pure-ish: the core logic (see `tick`) takes a mutable store and
 * a clock so tests can exercise it without the module-level
 * singleton.
 */

export interface RateLimitEntry {
  /** Timestamps of recent hits, oldest first. */
  hits: number[];
}

export interface RateLimitConfig {
  /** Sliding window in milliseconds. */
  windowMs: number;
  /** Max hits allowed in the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

/**
 * Pure tick: given a store, key, config, and clock, decide whether
 * the current request is allowed and mutate the store. Separated
 * from the singleton so tests can pass a fresh Map.
 */
export function tick(
  store: Map<string, RateLimitEntry>,
  key: string,
  config: RateLimitConfig,
  now: number,
): RateLimitResult {
  const cutoff = now - config.windowMs;
  const entry = store.get(key) ?? { hits: [] };
  // Drop hits older than the window.
  entry.hits = entry.hits.filter((t) => t > cutoff);

  if (entry.hits.length >= config.max) {
    const oldest = entry.hits[0] ?? now;
    store.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: oldest + config.windowMs,
    };
  }

  entry.hits.push(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: config.max - entry.hits.length,
    resetAtMs: now + config.windowMs,
  };
}

// ---------------------------------------------------------------------------
// Module-level singleton for production use
// ---------------------------------------------------------------------------

const globalStore = new Map<string, RateLimitEntry>();

/**
 * Five failed sign-in attempts per email per 5 minutes. Short
 * enough to frustrate dictionary attacks, long enough that a
 * legitimate user with a typo recovers in a coffee break.
 */
export const SIGNIN_LIMIT: RateLimitConfig = {
  windowMs: 5 * 60 * 1000,
  max: 5,
};

/**
 * A dedicated limit for password-reset endpoints, which should be
 * rarer than sign-ins. Protects against slow enumeration.
 */
export const PASSWORD_RESET_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 3,
};

/**
 * Convenience wrapper over `tick` that uses the module-level store
 * and `Date.now()`.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  return tick(globalStore, key, config, Date.now());
}

/**
 * Test helper: clear the singleton store so each test starts fresh.
 */
export function resetRateLimitStoreForTests(): void {
  globalStore.clear();
}

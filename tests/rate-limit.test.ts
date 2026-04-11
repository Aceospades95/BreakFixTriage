import { describe, it, expect } from "vitest";
import {
  type RateLimitConfig,
  type RateLimitEntry,
  tick,
} from "@/lib/auth/rate-limit";

describe("rate limiter tick", () => {
  const config: RateLimitConfig = { windowMs: 10_000, max: 3 };

  it("allows the first max requests and then blocks", () => {
    const store = new Map<string, RateLimitEntry>();
    const key = "user@example.com";
    let now = 1_000;

    const r1 = tick(store, key, config, now);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    now += 100;
    const r2 = tick(store, key, config, now);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    now += 100;
    const r3 = tick(store, key, config, now);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    now += 100;
    const r4 = tick(store, key, config, now);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("re-allows requests after the window slides past the oldest hit", () => {
    const store = new Map<string, RateLimitEntry>();
    const key = "user@example.com";

    // Burn through the budget right at t=0.
    tick(store, key, config, 0);
    tick(store, key, config, 100);
    tick(store, key, config, 200);
    expect(tick(store, key, config, 300).allowed).toBe(false);

    // 10s + 1ms later the first hit falls out of the window.
    const later = 10_001;
    expect(tick(store, key, config, later).allowed).toBe(true);
  });

  it("tracks independent budgets per key", () => {
    const store = new Map<string, RateLimitEntry>();
    const now = 1;
    tick(store, "a@example.com", config, now);
    tick(store, "a@example.com", config, now);
    tick(store, "a@example.com", config, now);
    expect(tick(store, "a@example.com", config, now).allowed).toBe(false);
    expect(tick(store, "b@example.com", config, now).allowed).toBe(true);
  });

  it("reports a reset time on the blocked response", () => {
    const store = new Map<string, RateLimitEntry>();
    const key = "u";
    tick(store, key, config, 0);
    tick(store, key, config, 0);
    tick(store, key, config, 0);
    const blocked = tick(store, key, config, 0);
    expect(blocked.allowed).toBe(false);
    // Oldest hit was at t=0, window is 10 s → reset at 10_000.
    expect(blocked.resetAtMs).toBe(10_000);
  });
});

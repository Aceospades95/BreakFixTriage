import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_URL,
  getRoutingProvider,
  getTileConfig,
  isRoadRoutingConfigured,
} from "@/lib/routing/config";

/**
 * Round-22 §3 — routing/tile config resolves env into safe defaults, and
 * road routing only reports "configured" when the provider's credential
 * is actually present.
 */

const ENV_KEYS = [
  "ROUTING_PROVIDER",
  "OSRM_URL",
  "MAPBOX_TOKEN",
  "NEXT_PUBLIC_MAP_TILE_URL",
  "NEXT_PUBLIC_MAP_TILE_ATTRIBUTION",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("routing config", () => {
  it("defaults to no road routing (labeled straight-line fallback)", () => {
    expect(getRoutingProvider()).toBe("none");
    expect(isRoadRoutingConfigured()).toBe(false);
  });

  it("osrm counts as configured only with OSRM_URL", () => {
    process.env.ROUTING_PROVIDER = "osrm";
    expect(isRoadRoutingConfigured()).toBe(false);
    process.env.OSRM_URL = "http://osrm:5000";
    expect(getRoutingProvider()).toBe("osrm");
    expect(isRoadRoutingConfigured()).toBe(true);
  });

  it("mapbox counts as configured only with MAPBOX_TOKEN", () => {
    process.env.ROUTING_PROVIDER = "mapbox";
    expect(isRoadRoutingConfigured()).toBe(false);
    process.env.MAPBOX_TOKEN = "pk.test";
    expect(isRoadRoutingConfigured()).toBe(true);
  });

  it("an unknown provider value is treated as none", () => {
    process.env.ROUTING_PROVIDER = "garmin";
    expect(getRoutingProvider()).toBe("none");
  });

  it("tile config falls back to OSM, overridable by env", () => {
    expect(getTileConfig().url).toBe(DEFAULT_TILE_URL);
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://tiles.example/{z}/{x}/{y}.png";
    expect(getTileConfig().url).toBe("https://tiles.example/{z}/{x}/{y}.png");
  });
});

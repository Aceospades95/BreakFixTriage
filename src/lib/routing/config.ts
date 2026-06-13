/**
 * Round-22 §3 (audit item D) — routing + map-tile configuration.
 *
 * Two independent knobs, both optional and both with safe zero-config
 * defaults so a fresh install still gets a working (if approximate) map:
 *
 *   ROUTING_PROVIDER = none | osrm | mapbox   (server-side; road geometry
 *     + drive times). "none" (default) draws straight lines explicitly
 *     labeled as an approximation and makes no duration claims.
 *
 *   NEXT_PUBLIC_MAP_TILE_URL / _ATTRIBUTION   (client-side; the base map
 *     tiles). Defaults to OpenStreetMap so dev works out of the box, but
 *     production should point this at a provider whose usage policy allows
 *     app traffic (MapTiler, Carto, Protomaps, self-hosted, …). See README.
 */

export type RoutingProvider = "none" | "osrm" | "mapbox";

export function getRoutingProvider(): RoutingProvider {
  const raw = (process.env.ROUTING_PROVIDER ?? "none").toLowerCase();
  if (raw === "osrm" || raw === "mapbox") return raw;
  return "none";
}

/** True when real road geometry + drive times are available. */
export function isRoadRoutingConfigured(): boolean {
  const provider = getRoutingProvider();
  if (provider === "osrm") return !!process.env.OSRM_URL;
  if (provider === "mapbox") return !!process.env.MAPBOX_TOKEN;
  return false;
}

export const DEFAULT_TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Base-map tile configuration. NEXT_PUBLIC_* so it is readable in the
 * client map components. Falls back to OpenStreetMap; the README flags
 * that production should configure a provider per its usage policy.
 */
export function getTileConfig(): { url: string; attribution: string } {
  return {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL,
    attribution:
      process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION,
  };
}

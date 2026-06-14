import "server-only";
import { getRoutingProvider, isRoadRoutingConfigured } from "./config";

/**
 * Round-22 §3 (audit item D) — real road geometry + drive times.
 *
 * Returns per-leg road distance/duration for an ordered list of stops
 * when a routing provider is configured (OSRM self-hosted, or Mapbox
 * Directions). Returns null when ROUTING_PROVIDER=none or the provider
 * isn't reachable — callers then fall back to the labeled straight-line
 * approximation and make no duration claims.
 *
 * Designed to be drop-in: stand up OSRM on the box, set
 * ROUTING_PROVIDER=osrm + OSRM_URL, and the map starts showing real
 * drive times with no code change. We deliberately don't block this
 * phase on standing OSRM up — the abstraction + fallback is the
 * deliverable.
 */

export interface RoadLeg {
  distanceKm: number;
  durationMin: number;
}

export interface RoadRoute {
  legs: RoadLeg[];
  totalKm: number;
  totalMin: number;
  provider: "osrm" | "mapbox";
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Bounded so a slow/unreachable router can't hang a page render. */
const ROUTER_TIMEOUT_MS = 4000;

export async function getRoadRoute(
  coords: LatLng[],
): Promise<RoadRoute | null> {
  if (coords.length < 2 || !isRoadRoutingConfigured()) return null;
  const provider = getRoutingProvider();
  try {
    if (provider === "osrm") return await fetchOsrm(coords);
    if (provider === "mapbox") return await fetchMapbox(coords);
  } catch (err) {
    console.error("[routing] road-route lookup failed; falling back:", err);
  }
  return null;
}

function withTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ROUTER_TIMEOUT_MS);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    legs?: { distance: number; duration: number }[];
  }[];
}

async function fetchOsrm(coords: LatLng[]): Promise<RoadRoute | null> {
  const base = (process.env.OSRM_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  const path = coords.map((c) => `${c.longitude},${c.latitude}`).join(";");
  const url = `${base}/route/v1/driving/${path}?overview=false`;
  const res = await withTimeout(url);
  if (!res.ok) return null;
  const body = (await res.json()) as OsrmResponse;
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route?.legs) return null;
  return toRoadRoute(
    route.legs.map((l) => ({
      distanceKm: l.distance / 1000,
      durationMin: l.duration / 60,
    })),
    "osrm",
  );
}

interface MapboxResponse {
  code: string;
  routes?: {
    legs?: { distance: number; duration: number }[];
  }[];
}

async function fetchMapbox(coords: LatLng[]): Promise<RoadRoute | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const path = coords.map((c) => `${c.longitude},${c.latitude}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?access_token=${token}&overview=false`;
  const res = await withTimeout(url);
  if (!res.ok) return null;
  const body = (await res.json()) as MapboxResponse;
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route?.legs) return null;
  return toRoadRoute(
    route.legs.map((l) => ({
      distanceKm: l.distance / 1000,
      durationMin: l.duration / 60,
    })),
    "mapbox",
  );
}

function toRoadRoute(
  legs: RoadLeg[],
  provider: "osrm" | "mapbox",
): RoadRoute {
  return {
    legs,
    totalKm: legs.reduce((a, l) => a + l.distanceKm, 0),
    totalMin: legs.reduce((a, l) => a + l.durationMin, 0),
    provider,
  };
}

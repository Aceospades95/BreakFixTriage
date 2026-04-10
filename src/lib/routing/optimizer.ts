/**
 * Route optimizer abstraction.
 *
 * The default implementation is a simple greedy nearest-neighbor over
 * straight-line (haversine) distance. It is good enough for 10–30 stops in
 * a single district and lets us validate the domain model and UI. In Phase
 * 4 we will add a GoogleRoutesOptimizer that calls the Google Routes
 * Directions API; callers will not have to change.
 *
 * Keeping this behind an interface costs almost nothing (one extra file)
 * and means we avoid threading Google Routes details through the scheduling
 * module.
 */

export interface Stop {
  /** Opaque id the caller uses to refer to the stop. */
  id: string;
  latitude: number;
  longitude: number;
  /** Optional priority boost (higher wins); unused by default optimizer. */
  priority?: number;
}

export interface OptimizeInput {
  origin: { latitude: number; longitude: number } | null;
  stops: Stop[];
}

export interface OptimizeResult {
  orderedStopIds: string[];
  estimatedDistanceKm: number;
  optimizerName: string;
}

export interface RouteOptimizer {
  readonly name: string;
  optimize(input: OptimizeInput): Promise<OptimizeResult>;
}

// ---- Haversine helper ------------------------------------------------------

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---- Nearest-neighbor optimizer --------------------------------------------

export const NearestNeighborOptimizer: RouteOptimizer = {
  name: "nearest-neighbor",
  async optimize(input) {
    const remaining = [...input.stops];
    const ordered: string[] = [];
    let cursor =
      input.origin ??
      (remaining[0]
        ? { latitude: remaining[0].latitude, longitude: remaining[0].longitude }
        : null);
    let distance = 0;

    while (remaining.length > 0) {
      if (!cursor) break;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        if (!s) continue;
        const d = haversineKm(cursor, s);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      if (!next) break;
      ordered.push(next.id);
      distance += bestDist;
      cursor = { latitude: next.latitude, longitude: next.longitude };
    }

    return {
      orderedStopIds: ordered,
      estimatedDistanceKm: Number(distance.toFixed(2)),
      optimizerName: "nearest-neighbor",
    };
  },
};

import { buildGoogleRoutesOptimizer } from "./google-routes";

/**
 * Resolve which optimizer to use from env.
 *
 * Selection rules:
 *   - `ROUTE_OPTIMIZER=google-routes` with a populated
 *     `GOOGLE_ROUTES_API_KEY` uses the Google Routes API.
 *   - Anything else (including `google-routes` with a missing key)
 *     falls back to the built-in nearest-neighbor optimizer.
 *
 * We intentionally fail open: the admin may have misconfigured their
 * env, but nobody wants route-building to hard-fail because of it.
 * The chosen optimizer is recorded on every Route row for audit.
 */
export function getOptimizer(): RouteOptimizer {
  const name = process.env.ROUTE_OPTIMIZER ?? "nearest-neighbor";
  if (name === "google-routes") {
    const optimizer = buildGoogleRoutesOptimizer(
      process.env.GOOGLE_ROUTES_API_KEY,
    );
    if (optimizer) return optimizer;
  }
  return NearestNeighborOptimizer;
}

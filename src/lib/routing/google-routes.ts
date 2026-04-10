/**
 * Google Routes API optimizer.
 *
 * Implements the `RouteOptimizer` interface by calling the Routes API
 * v2 `computeRoutes` endpoint with `waypointOptimization = true`. The
 * Google response includes `optimizedIntermediateWaypointIndex`, which
 * maps each intermediate waypoint to its position in the input array —
 * we invert that map to reorder the caller-supplied stop IDs.
 *
 * The response parser (`parseComputeRoutesResponse`) is exported as a
 * pure function so tests can exercise it without network access.
 *
 * Configuration:
 *   GOOGLE_ROUTES_API_KEY       (required) — the API key
 *   ROUTE_OPTIMIZER=google-routes (required) — select this optimizer
 *
 * The factory in `optimizer.ts` gracefully falls back to the default
 * nearest-neighbor optimizer when the API key is missing, so a bad
 * deployment can't break route building.
 */

import type { OptimizeInput, OptimizeResult, RouteOptimizer } from "./optimizer";

/**
 * Shape of the subset of `computeRoutes` we care about. Google returns
 * a lot more fields — we only read what we need.
 */
export interface ComputeRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    optimizedIntermediateWaypointIndex?: number[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Pure function: given an input stop list and the raw JSON response
 * from Google Routes, compute the reordered stop IDs and the route's
 * estimated distance in km.
 *
 * Throws on any malformed response so the caller can decide whether
 * to fall back to the default optimizer or propagate the failure.
 */
export function parseComputeRoutesResponse(
  stops: OptimizeInput["stops"],
  response: ComputeRoutesResponse,
): OptimizeResult {
  if (response.error) {
    throw new Error(
      `Google Routes: ${response.error.status ?? response.error.code ?? "error"}: ${response.error.message ?? "unknown"}`,
    );
  }
  const route = response.routes?.[0];
  if (!route) {
    throw new Error("Google Routes: empty routes array in response");
  }
  const order = route.optimizedIntermediateWaypointIndex;
  // If there is zero or one intermediate waypoint, Google does not
  // return an optimized order — the original sequence is already best.
  const orderedStopIds = Array.isArray(order) && order.length > 0
    ? order.map((i) => {
        const stop = stops[i];
        if (!stop) {
          throw new Error(
            `Google Routes: response referenced out-of-range waypoint index ${i}`,
          );
        }
        return stop.id;
      })
    : stops.map((s) => s.id);

  const distanceKm =
    typeof route.distanceMeters === "number"
      ? Number((route.distanceMeters / 1000).toFixed(2))
      : 0;

  return {
    orderedStopIds,
    estimatedDistanceKm: distanceKm,
    optimizerName: "google-routes",
  };
}

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Build the JSON body that `computeRoutes` expects. Exported so tests
 * can assert it without hitting the network.
 */
export function buildComputeRoutesBody(input: OptimizeInput): unknown {
  if (input.stops.length < 2 && input.origin == null) {
    throw new Error(
      "Google Routes needs an origin or at least two stops to optimize",
    );
  }

  const origin = input.origin ?? {
    latitude: input.stops[0]!.latitude,
    longitude: input.stops[0]!.longitude,
  };
  const [first, ...rest] = input.stops;
  const destinationStop = rest.length > 0 ? rest[rest.length - 1]! : first!;
  const intermediateStops =
    input.origin == null
      ? rest.slice(0, -1)
      : input.stops.slice(0, -1);

  return {
    origin: {
      location: {
        latLng: {
          latitude: origin.latitude,
          longitude: origin.longitude,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destinationStop.latitude,
          longitude: destinationStop.longitude,
        },
      },
    },
    intermediates: intermediateStops.map((s) => ({
      location: {
        latLng: {
          latitude: s.latitude,
          longitude: s.longitude,
        },
      },
    })),
    travelMode: "DRIVE",
    optimizeWaypointOrder: true,
  };
}

/**
 * Build a GoogleRoutesOptimizer bound to the given API key. Returns
 * null when the key is missing.
 */
export function buildGoogleRoutesOptimizer(
  apiKey: string | undefined,
): RouteOptimizer | null {
  if (!apiKey) return null;
  return {
    name: "google-routes",
    async optimize(input) {
      if (input.stops.length === 0) {
        return {
          orderedStopIds: [],
          estimatedDistanceKm: 0,
          optimizerName: "google-routes",
        };
      }
      const body = buildComputeRoutesBody(input);
      const res = await fetch(ROUTES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.optimizedIntermediateWaypointIndex",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ComputeRoutesResponse;
      if (!res.ok) {
        throw new Error(
          `Google Routes HTTP ${res.status}: ${json.error?.message ?? res.statusText}`,
        );
      }
      return parseComputeRoutesResponse(input.stops, json);
    },
  };
}

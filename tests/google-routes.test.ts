import { describe, it, expect } from "vitest";
import {
  buildComputeRoutesBody,
  parseComputeRoutesResponse,
} from "@/lib/routing/google-routes";
import type { OptimizeInput } from "@/lib/routing/optimizer";

const STOPS: OptimizeInput["stops"] = [
  { id: "A", latitude: 40.8, longitude: -73.9 },
  { id: "B", latitude: 40.7, longitude: -73.8 },
  { id: "C", latitude: 40.6, longitude: -73.7 },
  { id: "D", latitude: 40.5, longitude: -73.6 },
];

describe("parseComputeRoutesResponse", () => {
  it("reorders stops by the optimized waypoint index array", () => {
    const result = parseComputeRoutesResponse(STOPS, {
      routes: [
        {
          distanceMeters: 12500,
          optimizedIntermediateWaypointIndex: [2, 0, 1, 3],
        },
      ],
    });
    expect(result.orderedStopIds).toEqual(["C", "A", "B", "D"]);
    expect(result.estimatedDistanceKm).toBe(12.5);
    expect(result.optimizerName).toBe("google-routes");
  });

  it("keeps the original order when Google returns no optimized array", () => {
    const result = parseComputeRoutesResponse(STOPS, {
      routes: [{ distanceMeters: 5000 }],
    });
    expect(result.orderedStopIds).toEqual(["A", "B", "C", "D"]);
    expect(result.estimatedDistanceKm).toBe(5);
  });

  it("throws on an error payload", () => {
    expect(() =>
      parseComputeRoutesResponse(STOPS, {
        error: { code: 403, status: "PERMISSION_DENIED", message: "nope" },
      }),
    ).toThrow(/PERMISSION_DENIED/);
  });

  it("throws when the response references an out-of-range waypoint", () => {
    expect(() =>
      parseComputeRoutesResponse(STOPS, {
        routes: [
          {
            distanceMeters: 1000,
            optimizedIntermediateWaypointIndex: [0, 1, 9],
          },
        ],
      }),
    ).toThrow(/out-of-range/);
  });

  it("throws when routes is empty", () => {
    expect(() => parseComputeRoutesResponse(STOPS, { routes: [] })).toThrow(
      /empty routes/,
    );
  });

  it("handles distanceMeters missing gracefully", () => {
    const result = parseComputeRoutesResponse(STOPS, {
      routes: [{ optimizedIntermediateWaypointIndex: [1, 0, 2, 3] }],
    });
    expect(result.estimatedDistanceKm).toBe(0);
    expect(result.orderedStopIds).toEqual(["B", "A", "C", "D"]);
  });
});

describe("buildComputeRoutesBody", () => {
  it("builds a well-formed request body with intermediates", () => {
    const body = buildComputeRoutesBody({
      origin: null,
      stops: STOPS,
    }) as {
      origin: { location: { latLng: { latitude: number } } };
      destination: { location: { latLng: { latitude: number } } };
      intermediates: unknown[];
      travelMode: string;
      optimizeWaypointOrder: boolean;
    };
    expect(body.origin.location.latLng.latitude).toBe(40.8);
    expect(body.destination.location.latLng.latitude).toBe(40.5);
    expect(body.intermediates.length).toBe(2);
    expect(body.travelMode).toBe("DRIVE");
    expect(body.optimizeWaypointOrder).toBe(true);
  });

  it("refuses to build a body for zero stops with no origin", () => {
    expect(() =>
      buildComputeRoutesBody({ origin: null, stops: [] }),
    ).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  NearestNeighborOptimizer,
  haversineKm,
} from "@/lib/routing/optimizer";

describe("haversine", () => {
  it("returns 0 for the same point", () => {
    expect(
      haversineKm({ latitude: 40.7, longitude: -73.9 }, { latitude: 40.7, longitude: -73.9 }),
    ).toBeCloseTo(0, 6);
  });

  it("measures real distances with reasonable accuracy", () => {
    // Bronx to Queens-ish
    const d = haversineKm(
      { latitude: 40.8448, longitude: -73.8648 },
      { latitude: 40.7128, longitude: -73.8312 },
    );
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(30);
  });
});

describe("nearest-neighbor optimizer", () => {
  it("orders stops greedily from the origin", async () => {
    const result = await NearestNeighborOptimizer.optimize({
      origin: { latitude: 0, longitude: 0 },
      stops: [
        { id: "far", latitude: 0, longitude: 10 },
        { id: "near", latitude: 0, longitude: 1 },
        { id: "mid", latitude: 0, longitude: 5 },
      ],
    });
    expect(result.orderedStopIds).toEqual(["near", "mid", "far"]);
    expect(result.estimatedDistanceKm).toBeGreaterThan(0);
  });

  it("handles a single stop", async () => {
    const result = await NearestNeighborOptimizer.optimize({
      origin: { latitude: 0, longitude: 0 },
      stops: [{ id: "only", latitude: 0, longitude: 1 }],
    });
    expect(result.orderedStopIds).toEqual(["only"]);
  });

  it("handles an empty stop list", async () => {
    const result = await NearestNeighborOptimizer.optimize({
      origin: { latitude: 0, longitude: 0 },
      stops: [],
    });
    expect(result.orderedStopIds).toEqual([]);
    expect(result.estimatedDistanceKm).toBe(0);
  });

  it("works with no explicit origin (uses first stop)", async () => {
    const result = await NearestNeighborOptimizer.optimize({
      origin: null,
      stops: [
        { id: "a", latitude: 0, longitude: 0 },
        { id: "b", latitude: 0, longitude: 1 },
        { id: "c", latitude: 0, longitude: 5 },
      ],
    });
    expect(result.orderedStopIds[0]).toBe("a");
    expect(result.orderedStopIds[1]).toBe("b");
    expect(result.orderedStopIds[2]).toBe("c");
  });
});

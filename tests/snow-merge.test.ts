import { describe, it, expect } from "vitest";
import { matchSynthsToImports } from "@/lib/snow-merge";

/**
 * Round-4 §N1 — pure-function matcher contract for the SNOW
 * import reconciler. The DB-backed reconcileSnowImport above
 * uses this match logic implicitly; these tests pin the
 * `(deviceId, schoolId)` join semantics without touching Prisma.
 */

describe("matchSynthsToImports (Round-4 §N1)", () => {
  it("matches a synthetic to an imported on (deviceId, schoolId)", () => {
    const synthetics = [
      { id: "synth-1", deviceId: "dev-1", schoolId: "school-A" },
    ];
    const imports = [
      { id: "imp-1", deviceId: "dev-1", schoolId: "school-A" },
    ];
    const proposals = matchSynthsToImports(synthetics, imports);
    expect(proposals).toEqual([
      { syntheticId: "synth-1", importedId: "imp-1" },
    ]);
  });

  it("does not match across schools", () => {
    const proposals = matchSynthsToImports(
      [{ id: "synth-1", deviceId: "dev-1", schoolId: "school-A" }],
      [{ id: "imp-1", deviceId: "dev-1", schoolId: "school-B" }],
    );
    expect(proposals).toEqual([]);
  });

  it("does not match different devices", () => {
    const proposals = matchSynthsToImports(
      [{ id: "synth-1", deviceId: "dev-1", schoolId: "school-A" }],
      [{ id: "imp-1", deviceId: "dev-2", schoolId: "school-A" }],
    );
    expect(proposals).toEqual([]);
  });

  it("ignores synthetics with null deviceId (impossible but defensive)", () => {
    const proposals = matchSynthsToImports(
      [
        { id: "synth-1", deviceId: null, schoolId: "school-A" },
        { id: "synth-2", deviceId: "dev-2", schoolId: "school-A" },
      ],
      [
        { id: "imp-1", deviceId: "dev-2", schoolId: "school-A" },
      ],
    );
    expect(proposals).toEqual([
      { syntheticId: "synth-2", importedId: "imp-1" },
    ]);
  });

  it("ignores imports with null deviceId", () => {
    const proposals = matchSynthsToImports(
      [{ id: "synth-1", deviceId: "dev-1", schoolId: "school-A" }],
      [{ id: "imp-1", deviceId: null, schoolId: "school-A" }],
    );
    expect(proposals).toEqual([]);
  });

  it("emits one proposal per (synth × import) match", () => {
    // Two synthetics on the same (device, school) and one
    // import — two proposals; the operator picks which to merge.
    const proposals = matchSynthsToImports(
      [
        { id: "synth-1", deviceId: "dev-1", schoolId: "school-A" },
        { id: "synth-2", deviceId: "dev-1", schoolId: "school-A" },
      ],
      [{ id: "imp-1", deviceId: "dev-1", schoolId: "school-A" }],
    );
    expect(proposals).toHaveLength(2);
    expect(proposals).toContainEqual({
      syntheticId: "synth-1",
      importedId: "imp-1",
    });
    expect(proposals).toContainEqual({
      syntheticId: "synth-2",
      importedId: "imp-1",
    });
  });

  it("returns empty when both lists are empty", () => {
    expect(matchSynthsToImports([], [])).toEqual([]);
  });
});

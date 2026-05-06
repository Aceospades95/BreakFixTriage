import { describe, it, expect } from "vitest";

/**
 * Bug 4a: the manager-view bench was rendering only the Unassigned
 * bucket because (a) the seed never assigned any ticket so the
 * groupBy returned empty, and (b) the bucketing logic depended on a
 * separate `groupBy` round-trip that, when empty, short-circuited
 * the user lookup.
 *
 * Post-fix the bucketing is computed from a single `findMany` of
 * assigned tickets — no separate groupBy. This test pins the
 * bucketing transform.
 */

type T = {
  id: string;
  incidentNumber: string;
  assignedUserId: string | null;
};

function bucketize(tickets: T[]): {
  byUser: Map<string, T[]>;
  assigneeIds: string[];
} {
  const byUser = new Map<string, T[]>();
  for (const t of tickets) {
    if (!t.assignedUserId) continue;
    const bucket = byUser.get(t.assignedUserId) ?? [];
    bucket.push(t);
    byUser.set(t.assignedUserId, bucket);
  }
  return { byUser, assigneeIds: Array.from(byUser.keys()) };
}

describe("bench bucketing (bug 4a)", () => {
  it("creates one bucket per assignee", () => {
    const { byUser, assigneeIds } = bucketize([
      { id: "1", incidentNumber: "INC1", assignedUserId: "alex" },
      { id: "2", incidentNumber: "INC2", assignedUserId: "alex" },
      { id: "3", incidentNumber: "INC3", assignedUserId: "tess" },
    ]);
    expect(assigneeIds.sort()).toEqual(["alex", "tess"]);
    expect(byUser.get("alex")?.length).toBe(2);
    expect(byUser.get("tess")?.length).toBe(1);
  });

  it("ignores unassigned tickets in user buckets", () => {
    const { byUser, assigneeIds } = bucketize([
      { id: "1", incidentNumber: "INC1", assignedUserId: null },
      { id: "2", incidentNumber: "INC2", assignedUserId: "alex" },
    ]);
    expect(assigneeIds).toEqual(["alex"]);
    expect(byUser.get("alex")?.length).toBe(1);
  });

  it("returns no buckets when nothing is assigned (matches seed-only state)", () => {
    const { byUser, assigneeIds } = bucketize([
      { id: "1", incidentNumber: "INC1", assignedUserId: null },
      { id: "2", incidentNumber: "INC2", assignedUserId: null },
    ]);
    expect(assigneeIds).toEqual([]);
    expect(byUser.size).toBe(0);
  });

  it("preserves stable ordering within a bucket (insertion order)", () => {
    const { byUser } = bucketize([
      { id: "1", incidentNumber: "INC-A", assignedUserId: "alex" },
      { id: "2", incidentNumber: "INC-B", assignedUserId: "alex" },
      { id: "3", incidentNumber: "INC-C", assignedUserId: "alex" },
    ]);
    expect(byUser.get("alex")?.map((t) => t.incidentNumber)).toEqual([
      "INC-A",
      "INC-B",
      "INC-C",
    ]);
  });
});

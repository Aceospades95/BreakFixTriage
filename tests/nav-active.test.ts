import { describe, expect, it } from "vitest";
import { isNavItemActive, pathMatchesHref } from "@/lib/nav-active";

const HREFS = [
  "/",
  "/tickets",
  "/bench",
  "/scheduling",
  "/scheduling/people",
  "/dashboards",
  "/admin",
];

describe("nav active-state", () => {
  it("only the most specific item is active on a nested path", () => {
    // The bug: /scheduling/people lit up both Scheduling and People.
    expect(isNavItemActive("/scheduling/people", "/scheduling/people", HREFS)).toBe(true);
    expect(isNavItemActive("/scheduling/people", "/scheduling", HREFS)).toBe(false);
  });

  it("the parent is active on its own page and on non-overlapping children", () => {
    expect(isNavItemActive("/scheduling", "/scheduling", HREFS)).toBe(true);
    expect(isNavItemActive("/scheduling/routes/abc", "/scheduling", HREFS)).toBe(true);
  });

  it("Home only matches exactly", () => {
    expect(isNavItemActive("/", "/", HREFS)).toBe(true);
    expect(isNavItemActive("/tickets", "/", HREFS)).toBe(false);
  });

  it("a deep route under a single item still highlights it", () => {
    expect(isNavItemActive("/tickets/INC123", "/tickets", HREFS)).toBe(true);
  });

  it("pathMatchesHref handles exact, prefix, and root", () => {
    expect(pathMatchesHref("/admin", "/admin")).toBe(true);
    expect(pathMatchesHref("/admin/users", "/admin")).toBe(true);
    expect(pathMatchesHref("/administrator", "/admin")).toBe(false); // not a path segment
    expect(pathMatchesHref("/x", "/")).toBe(false);
  });
});

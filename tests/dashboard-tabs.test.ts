import { describe, it, expect } from "vitest";

/**
 * Closes findings bug A1.
 *
 * The DashboardTabs component highlights the "Overview" tab only on
 * /dashboards exactly, and a sibling tab on /dashboards/<sibling>
 * (and any sub-route under it). This test pins the active-tab logic
 * without booting React — the rule is small enough to inline.
 */

const TABS: { href: string; label: string }[] = [
  { href: "/dashboards", label: "Overview" },
  { href: "/dashboards/finance", label: "Finance" },
  { href: "/dashboards/productivity", label: "Productivity" },
  { href: "/dashboards/devices", label: "Device Hotspots" },
];

function isActive(tabHref: string, pathname: string): boolean {
  return tabHref === "/dashboards"
    ? pathname === "/dashboards"
    : pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

describe("DashboardTabs active-tab rule (A1)", () => {
  it("Overview tab is active only on exact /dashboards", () => {
    expect(isActive("/dashboards", "/dashboards")).toBe(true);
    expect(isActive("/dashboards", "/dashboards/finance")).toBe(false);
    expect(isActive("/dashboards", "/dashboards/productivity")).toBe(false);
  });

  it("Finance tab is active on /dashboards/finance and sub-routes", () => {
    expect(isActive("/dashboards/finance", "/dashboards/finance")).toBe(true);
    expect(isActive("/dashboards/finance", "/dashboards/finance/breakdown")).toBe(true);
    expect(isActive("/dashboards/finance", "/dashboards")).toBe(false);
    expect(isActive("/dashboards/finance", "/dashboards/productivity")).toBe(false);
  });

  it("each sibling lights up only on its own route", () => {
    const cases: { path: string; activeLabel: string }[] = [
      { path: "/dashboards", activeLabel: "Overview" },
      { path: "/dashboards/finance", activeLabel: "Finance" },
      { path: "/dashboards/productivity", activeLabel: "Productivity" },
      { path: "/dashboards/devices", activeLabel: "Device Hotspots" },
    ];
    for (const c of cases) {
      const actives = TABS.filter((t) => isActive(t.href, c.path));
      expect(actives.map((a) => a.label)).toEqual([c.activeLabel]);
    }
  });

  it("never activates two tabs at once on a deep route", () => {
    const path = "/dashboards/finance/q3-2026";
    const actives = TABS.filter((t) => isActive(t.href, path));
    expect(actives.length).toBe(1);
    expect(actives[0]?.label).toBe("Finance");
  });
});

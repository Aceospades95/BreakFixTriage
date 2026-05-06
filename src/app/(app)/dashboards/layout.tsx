import { DashboardTabs } from "@/components/dashboard-tabs";

/**
 * Wrapper for every /dashboards/* page so the tab bar stays put
 * across Overview / Finance / Productivity / Device Hotspots
 * navigation.
 *
 * Closes findings bug A1: previously each sub-route only rendered a
 * "← Overview" link instead of the full tab bar, because the bar
 * lived inside dashboards/page.tsx alone.
 */
export default function DashboardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DashboardTabs />
      {children}
    </>
  );
}

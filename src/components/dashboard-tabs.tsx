"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Tab bar for the /dashboards/* family. Persistent across every
 * sub-route (Overview, Finance, Productivity, Device Hotspots) —
 * lives in src/app/(app)/dashboards/layout.tsx so adding a new
 * sibling page only needs an entry here, not a copy of the bar in
 * every page.
 *
 * Closes findings bug A1.
 */

const TABS: { href: string; label: string }[] = [
  { href: "/dashboards", label: "Overview" },
  { href: "/dashboards/boroughs", label: "By Borough" },
  { href: "/dashboards/finance", label: "Finance" },
  { href: "/dashboards/productivity", label: "Productivity" },
  { href: "/dashboards/devices", label: "Device Hotspots" },
];

export function DashboardTabs() {
  const pathname = usePathname() ?? "";
  // Five-borough expansion — carry the selected borough across tabs.
  // Without this you pick Bronx on the overview, click Finance, and
  // read citywide money as if it were Bronx money: the filter is
  // gone but nothing on the page says so.
  const borough = useSearchParams()?.get("borough") ?? "";

  return (
    <nav
      aria-label="Dashboards"
      className="mb-6 flex gap-1 rounded-lg border border-surface-border bg-surface-muted/60 p-1"
    >
      {TABS.map((tab) => {
        // Overview is the only one that should match exactly — every
        // other tab is a sub-route.
        const active =
          tab.href === "/dashboards"
            ? pathname === "/dashboards"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const href = borough
          ? `${tab.href}?borough=${encodeURIComponent(borough)}`
          : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-4 py-2 text-sm transition",
              active
                ? "bg-accent font-semibold text-white"
                : "text-slate-300 hover:bg-surface-border/40 hover:text-white",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

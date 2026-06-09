/**
 * Round-13 §4B — routes manifest.
 *
 * Source of truth for the §1A sidebar gate, the chromed-404
 * spec, and the persona spec authorization checks. Pinned
 * by-hand rather than generated at build time so:
 *
 *   1. CI runs without an extra "manifest-build" step.
 *   2. New routes get an explicit Allow set + permission gate
 *      review, not an automatic inclusion.
 *
 * Each entry documents:
 *   - path: the public URL path (with [param] segments)
 *   - allow: roles that should land 200; everything else 403 /
 *     redirect
 *   - publicAnonymous: true if the route returns 200 without a
 *     session (e.g. /signin)
 *
 * The §1A gate that walks every <a> in the global sidebar reads
 * this manifest to assert each href is a known path.
 */

import type { Role } from "@prisma/client";

export interface RouteEntry {
  path: string;
  allow: ReadonlyArray<Role | "ANY"> | "ANY";
  publicAnonymous?: boolean;
  /** Documented intentional redirect target (path), if any. */
  redirectsTo?: string;
}

const ALL_AUTHENTICATED: ReadonlyArray<Role> = [
  "ADMIN",
  "OPS_MANAGER",
  "DISPATCHER",
  "WAREHOUSE",
  "TECHNICIAN",
  "DRIVER",
  "READ_ONLY",
];

export const ROUTES_MANIFEST: ReadonlyArray<RouteEntry> = [
  // Public
  { path: "/signin", allow: "ANY", publicAnonymous: true },
  { path: "/portal/[token]", allow: "ANY", publicAnonymous: true },

  // Authenticated, no permission gate
  { path: "/", allow: ALL_AUTHENTICATED },
  { path: "/audit", allow: ALL_AUTHENTICATED },
  { path: "/me/preferences", allow: ALL_AUTHENTICATED },
  { path: "/me/schedule", allow: ALL_AUTHENTICATED },
  { path: "/my-day", allow: ALL_AUTHENTICATED },
  { path: "/notifications", allow: ALL_AUTHENTICATED },
  { path: "/profile", allow: ALL_AUTHENTICATED },
  { path: "/profile/2fa", allow: ALL_AUTHENTICATED },
  // Round-14 (B8) — chromed access-denied destination for
  // requireRole redirects.
  { path: "/forbidden", allow: ALL_AUTHENTICATED },
  // Round-15 (B11) — /people graduated from the Round-13 redirect
  // into a real staff directory.
  { path: "/people", allow: ALL_AUTHENTICATED },

  // Tickets
  { path: "/tickets", allow: ALL_AUTHENTICATED },
  { path: "/tickets/[ticketId]", allow: ALL_AUTHENTICATED },
  { path: "/tickets/[ticketId]/print", allow: ALL_AUTHENTICATED },
  { path: "/tickets/kanban", allow: ALL_AUTHENTICATED },
  { path: "/bench", allow: ALL_AUTHENTICATED },
  { path: "/duplicates", allow: ALL_AUTHENTICATED },
  { path: "/scan", allow: ALL_AUTHENTICATED },
  {
    path: "/scan/warehouse",
    allow: ["ADMIN", "OPS_MANAGER", "DISPATCHER", "WAREHOUSE", "TECHNICIAN"],
  },

  // Scheduling
  { path: "/scheduling", allow: ALL_AUTHENTICATED },
  { path: "/scheduling/calendar", allow: ALL_AUTHENTICATED },
  { path: "/scheduling/people", allow: ALL_AUTHENTICATED },
  { path: "/scheduling/routes", allow: ALL_AUTHENTICATED },
  { path: "/scheduling/routes/[routeId]", allow: ALL_AUTHENTICATED },
  { path: "/scheduling/routes/[routeId]/print", allow: ALL_AUTHENTICATED },
  {
    path: "/scheduling/routes/new",
    allow: ["ADMIN", "OPS_MANAGER", "DISPATCHER"],
  },

  // Imports + Quotes + Invoices
  { path: "/imports", allow: ALL_AUTHENTICATED },
  { path: "/imports/[batchId]", allow: ALL_AUTHENTICATED },
  { path: "/imports/new", allow: ["ADMIN", "OPS_MANAGER"] },
  { path: "/quotes", allow: ALL_AUTHENTICATED },
  { path: "/invoices", allow: ALL_AUTHENTICATED },

  // Dashboards
  { path: "/dashboards", allow: ALL_AUTHENTICATED },
  { path: "/dashboards/devices", allow: ALL_AUTHENTICATED },
  { path: "/dashboards/finance", allow: ALL_AUTHENTICATED },
  { path: "/dashboards/productivity", allow: ALL_AUTHENTICATED },

  // Admin
  { path: "/admin", allow: ["ADMIN"] },
  { path: "/admin/audit", allow: ["ADMIN"] },
  // Round-15 (B26) — ops exceptions dashboard.
  { path: "/admin/exceptions", allow: ["ADMIN"] },
  { path: "/admin/device-models", allow: ["ADMIN"] },
  { path: "/admin/device-models/[modelId]", allow: ["ADMIN"] },
  { path: "/admin/devices", allow: ["ADMIN"] },
  { path: "/admin/devices/new", allow: ["ADMIN"] },
  { path: "/admin/devices/[deviceId]", allow: ["ADMIN"] },
  { path: "/admin/districts", allow: ["ADMIN"] },
  { path: "/admin/email-log", allow: ["ADMIN", "OPS_MANAGER"] },
  // Round-13 hotfix — OPS_MANAGER can READ /admin/email-rules
  // but the server actions for create/update/delete are gated
  // on EMAIL_RULES_MANAGE (ADMIN-only), and the page disables
  // every write affordance for non-admin viewers.
  { path: "/admin/email-rules", allow: ["ADMIN", "OPS_MANAGER"] },
  { path: "/admin/email-templates", allow: ["ADMIN", "OPS_MANAGER"] },
  { path: "/admin/email-templates/[id]", allow: ["ADMIN", "OPS_MANAGER"] },
  { path: "/admin/holidays", allow: ["ADMIN"] },
  { path: "/admin/parts", allow: ["ADMIN"] },
  { path: "/admin/parts/new", allow: ["ADMIN"] },
  { path: "/admin/parts/[partId]", allow: ["ADMIN"] },
  { path: "/admin/permissions", allow: ["ADMIN"] },
  { path: "/admin/schools", allow: ["ADMIN"] },
  { path: "/admin/schools/new", allow: ["ADMIN"] },
  { path: "/admin/schools/[schoolId]", allow: ["ADMIN"] },
  { path: "/admin/settings", allow: ["ADMIN"] },
  { path: "/admin/statuses", allow: ["ADMIN"] },
  { path: "/admin/templates", allow: ["ADMIN"] },
  { path: "/admin/tools/bulk-close", allow: ["ADMIN"] },
  { path: "/admin/users", allow: ["ADMIN"] },
  { path: "/admin/users/new", allow: ["ADMIN"] },
  { path: "/admin/users/[userId]", allow: ["ADMIN"] },
];

/**
 * The set of paths emitted by sidebar.tsx as <Link href="">. The
 * §1A gate asserts every entry resolves to a manifest entry.
 *
 * Static lookup so the test runs without parsing the sidebar
 * source at runtime.
 */
export const SIDEBAR_HREFS: ReadonlyArray<string> = [
  "/",
  "/my-day",
  "/tickets",
  "/tickets/kanban",
  "/bench",
  "/scheduling",
  "/scheduling/people",
  "/quotes",
  "/invoices",
  "/duplicates",
  "/imports",
  "/dashboards",
  "/dashboards/finance",
  "/dashboards/productivity",
  "/dashboards/devices",
  "/scan",
  "/admin",
  "/admin/audit",
  "/admin/users",
  "/admin/permissions",
  "/admin/holidays",
  "/admin/email-rules",
  "/admin/email-templates",
  "/admin/email-log",
  "/admin/settings",
  "/admin/statuses",
  "/admin/tools/bulk-close",
  "/notifications",
  "/profile",
  "/me/preferences",
];

const PATH_BY_PATH = new Map<string, RouteEntry>(
  ROUTES_MANIFEST.map((r) => [r.path, r]),
);

export function findRoute(path: string): RouteEntry | undefined {
  return PATH_BY_PATH.get(path);
}

/**
 * Round-13 §4A.3 — assert every sidebar href maps to a manifest
 * entry. Throws on the first miss with a developer-readable
 * error.
 */
export function assertSidebarHrefsAreKnownRoutes(): void {
  const unknown: string[] = [];
  for (const href of SIDEBAR_HREFS) {
    if (!PATH_BY_PATH.has(href)) {
      unknown.push(href);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Sidebar href(s) not in routes manifest: ${unknown.join(", ")}. Add them to ROUTES_MANIFEST or remove from the sidebar.`,
    );
  }
}

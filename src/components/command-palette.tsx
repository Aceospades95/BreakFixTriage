"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Round-10 §2A — global Cmd+K command palette.
 *
 * Opens on Cmd+K / Ctrl+K from anywhere in the app. Surfaces:
 *
 *   - Static nav destinations (My day, Tickets, Bench, Scheduling,
 *     People, Quotes, Invoices, Imports, Duplicates, Dashboards,
 *     Admin + sub-pages).
 *   - Ticket-shaped queries (INC*, SYN*) — Enter routes to
 *     /tickets/{INC#}; the existing Round-5 INC URL redirect on
 *     /tickets/[ticketId] handles the cuid resolve.
 *   - School codes (e.g. "11X101") — routed to /admin/schools? at
 *     a future round; for R10 they're matched but route to the
 *     general school list filter.
 *
 * Esc closes; ↑/↓ moves the highlight; Enter routes to the
 * highlighted match.
 *
 * The palette renders nothing on the server — it's a client-only
 * island that mounts inside the (app) layout.
 */

interface PaletteItem {
  /** Stable id for the keyed list. */
  id: string;
  /** Display label (humanised). */
  label: string;
  /** Optional secondary line (e.g. URL hint). */
  hint?: string;
  /** Where Enter takes the user. */
  href: string;
  /** Filterable text. */
  searchText: string;
}

const NAV_ITEMS: PaletteItem[] = [
  { id: "myday", label: "My day", href: "/", searchText: "my day home" },
  { id: "tickets", label: "Tickets", href: "/tickets", searchText: "tickets list" },
  { id: "kanban", label: "Kanban board", href: "/tickets/kanban", searchText: "kanban tickets board columns" },
  { id: "bench", label: "Bench", href: "/bench", searchText: "bench unassigned techs" },
  { id: "scheduling", label: "Scheduling", href: "/scheduling", searchText: "scheduling routes" },
  { id: "calendar", label: "Calendar", href: "/scheduling/calendar", searchText: "calendar scheduling routes day week month" },
  { id: "people", label: "People schedule", href: "/scheduling/people", searchText: "people schedule blocks pto training" },
  { id: "quotes", label: "Quotes", href: "/quotes", searchText: "quotes" },
  { id: "duplicates", label: "Duplicates", href: "/duplicates", searchText: "duplicates queue snow link merge synthetic" },
  { id: "imports", label: "Imports", href: "/imports", searchText: "imports csv servicenow" },
  { id: "imports-new", label: "New import", href: "/imports/new", searchText: "imports new upload csv" },
  { id: "dashboards", label: "Dashboards", href: "/dashboards", searchText: "dashboards open aging closed" },
  { id: "dashboards-finance", label: "Finance dashboard", href: "/dashboards/finance", searchText: "dashboards finance po invoice parts" },
  { id: "dashboards-productivity", label: "Productivity dashboard", href: "/dashboards/productivity", searchText: "dashboards productivity turnaround time logged" },
  { id: "dashboards-devices", label: "Devices dashboard", href: "/dashboards/devices", searchText: "dashboards devices school heatmap" },
  { id: "scan", label: "Scan", href: "/scan", searchText: "scan barcode qr camera lookup" },
  { id: "notifications", label: "Notifications", href: "/notifications", searchText: "notifications bell inbox" },
  { id: "profile", label: "Profile", href: "/profile", searchText: "profile password role me" },
  { id: "preferences", label: "Preferences", href: "/me/preferences", searchText: "preferences digest theme me" },
  { id: "admin", label: "Admin", href: "/admin", searchText: "admin overview" },
  { id: "admin-users", label: "Admin · Users", href: "/admin/users", searchText: "admin users role disable" },
  { id: "admin-districts", label: "Admin · Districts", href: "/admin/districts", searchText: "admin districts" },
  { id: "admin-schools", label: "Admin · Schools", href: "/admin/schools", searchText: "admin schools" },
  { id: "admin-devices", label: "Admin · Devices", href: "/admin/devices", searchText: "admin devices serial asset tag" },
  { id: "admin-device-models", label: "Admin · Device models", href: "/admin/device-models", searchText: "admin device models manufacturer" },
  { id: "admin-parts", label: "Admin · Parts", href: "/admin/parts", searchText: "admin parts inventory sku" },
  { id: "admin-permissions", label: "Admin · Permissions", href: "/admin/permissions", searchText: "admin permissions role matrix" },
  { id: "admin-statuses", label: "Admin · Statuses", href: "/admin/statuses", searchText: "admin statuses sla labels" },
  { id: "admin-templates", label: "Admin · Templates", href: "/admin/templates", searchText: "admin ticket templates" },
  { id: "admin-email-rules", label: "Admin · Email rules", href: "/admin/email-rules", searchText: "admin email rules notify" },
  { id: "admin-email-templates", label: "Admin · Email templates", href: "/admin/email-templates", searchText: "admin email templates seed" },
  { id: "admin-email-log", label: "Admin · Email log", href: "/admin/email-log", searchText: "admin email log sent" },
  { id: "admin-holidays", label: "Admin · Holidays", href: "/admin/holidays", searchText: "admin holidays sla calendar" },
  { id: "admin-settings", label: "Admin · Settings", href: "/admin/settings", searchText: "admin settings sla bulk close digest" },
  { id: "admin-bulk-close", label: "Admin · Bulk close stale", href: "/admin/tools/bulk-close", searchText: "admin bulk close stale tickets" },
  { id: "admin-audit", label: "Admin · Audit log", href: "/admin/audit", searchText: "admin audit log entries" },
];

function detectSpecial(query: string): PaletteItem | null {
  const q = query.trim();
  if (!q) return null;
  const upper = q.toUpperCase();

  // Ticket numbers — INC* or SYN-*. The Round-5 §2.11 INC URL
  // redirect resolves the URL form back to a cuid. Round-11 §1A —
  // the `hint` field renders in user-facing JSX, so it must be
  // humanised, not a URL path. The label already carries the
  // ticket number; the hint adds entity context without leaking
  // the underlying route.
  if (/^(INC|SYN-)[A-Z0-9-]+$/i.test(upper)) {
    return {
      id: `ticket:${upper}`,
      label: `Open ticket ${upper}`,
      hint: "Ticket",
      href: `/tickets/${upper}`,
      searchText: upper,
    };
  }

  // School codes — DBN format like 11X101.
  if (/^\d{2}[A-Z]\d{3}$/i.test(upper)) {
    return {
      id: `school:${upper}`,
      label: `Find school ${upper}`,
      hint: "Filter the schools list",
      href: `/admin/schools?q=${encodeURIComponent(upper)}`,
      searchText: upper,
    };
  }

  // Device serials / asset tags (SN-…, AT-…) — route to /admin/devices
  // search.
  if (/^(SN-|AT-)[A-Z0-9-]+$/i.test(upper)) {
    return {
      id: `device:${upper}`,
      label: `Find device ${upper}`,
      hint: "Search the devices list",
      href: `/admin/devices?q=${encodeURIComponent(upper)}`,
      searchText: upper,
    };
  }

  return null;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Open / close on Cmd+K (mac) or Ctrl+K (everyone else).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setHighlighted(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const matches = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const special = detectSpecial(query);
    const filtered = q
      ? NAV_ITEMS.filter((item) =>
          item.searchText.toLowerCase().includes(q),
        )
      : NAV_ITEMS;
    return special ? [special, ...filtered] : filtered.slice(0, 30);
  }, [query]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-24"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-surface-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(matches.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const target = matches[highlighted];
              if (target) navigate(target.href);
            }
          }}
          placeholder="Search nav, INC2200126, school code, SN-…"
          className="w-full border-b border-surface-border bg-transparent px-4 py-3 text-sm text-slate-100 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <ul className="max-h-96 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate-500">
              No matches.
            </li>
          ) : (
            matches.map((item, idx) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={close}
                  className={`flex flex-col gap-0.5 px-4 py-2 text-sm ${
                    idx === highlighted
                      ? "bg-accent/15 text-white"
                      : "text-slate-200 hover:bg-surface-muted"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="text-[10px] text-slate-500">
                      {item.hint}
                    </span>
                  )}
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-surface-border px-4 py-2 text-[10px] text-slate-500">
          <span>↑↓ navigate · ↵ open · Esc close</span>
          <span>{matches.length} match{matches.length === 1 ? "" : "es"}</span>
        </div>
      </div>
    </div>
  );
}

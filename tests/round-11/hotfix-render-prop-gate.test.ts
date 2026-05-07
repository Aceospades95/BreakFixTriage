import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

// Round-11 §HOTFIX-1 — regression gate.
//
// The /tickets index threw an SSR error in production
// (digest=3087090167) because Round-10's BulkSelectionWatcher
// component used a `children: (count) => JSX` render-prop and was
// rendered from a server component. Function children cannot
// cross the React Server Components boundary.
//
// This file pins the fix and adds a generic gate that catches the
// pattern across the whole client-component surface.

describe("Round-11 §HOTFIX-1 — render-prop antipattern gate", () => {
  it("deletes the broken bulk-selection-watcher", () => {
    expect(
      existsSync(join(ROOT, "src/components/bulk-selection-watcher.tsx")),
    ).toBe(false);
  });

  it("ships the new client-only TicketsBulkActions component", () => {
    const path = join(ROOT, "src/components/tickets-bulk-actions.tsx");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain("export function TicketsBulkActions");
    // No render-prop children on the new component:
    expect(src).not.toMatch(/children:\s*\([^)]*\)\s*=>/);
  });

  it("/tickets/page.tsx wires the new component", () => {
    const src = readFileSync(
      join(ROOT, "src/app/(app)/tickets/page.tsx"),
      "utf8",
    );
    expect(src).toContain('from "@/components/tickets-bulk-actions"');
    expect(src).not.toContain('from "@/components/bulk-selection-watcher"');
    expect(src).toContain("<TicketsBulkActions");
  });

  it("no client component declares a render-prop children", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry)) continue;
        const src = readFileSync(full, "utf8");
        if (!src.includes('"use client"')) continue;
        if (/children:\s*\([^)]*\)\s*=>\s*[A-Za-z]/.test(src)) {
          offenders.push(full.replace(`${ROOT}/`, ""));
        }
      }
    }
    walk(join(ROOT, "src/components"));
    walk(join(ROOT, "src/app"));
    expect(
      offenders,
      `Render-prop children on a client component will fail SSR if rendered from a server component. Offenders: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

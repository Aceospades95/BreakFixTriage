import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1C — wave-4 leak sweep regression gate.
 *
 * Eight leaks catalogued from operator recon. Each gets a pinned
 * assertion below + the broader sweep (#8) walks every UI file to
 * catch new instances of the same class.
 */

describe("Round-12 §1C — leak sweep wave 4", () => {
  it("#1: /tickets/[id] DETAILS — ServiceNow ID label drops sys_id snake_case", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toContain("<Dt>ServiceNow ID</Dt>");
    expect(src).not.toContain("ServiceNow sys_id");
  });

  it("#2: /tickets/[id] ASSIGNEE select humanises role enum", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toContain("{u.name} ({humanise(u.role)})");
    expect(src).not.toContain("{u.name} ({u.role})");
  });

  it("#3: /bench persona card subtitle uses formatRole", () => {
    const src = read("src/app/(app)/bench/page.tsx");
    expect(src).toContain("formatRole(u.role)");
    expect(src).toContain('from "@/lib/format"');
  });

  it("#4: /admin/audit Entity ID label drops the (cuid) parenthetical", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("Entity ID");
    expect(src).not.toContain("Entity id (cuid)");
  });

  it("#5/#7: /admin/audit User entity rows resolve to display name", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toContain("userLabelByCuid");
    expect(src).toMatch(/log\.entityType === "User"/);
    // userLabel is in the display fallback chain (Round-12 §2C
    // extended the chain with email/holiday labels — the chain
    // still ends at log.entityId).
    expect(src).toMatch(/userLabel\s*\?\?[\s\S]*?log\.entityId/);
  });

  it("#5/#7: /admin/audit User entity chip puts cuid in title tooltip", () => {
    const src = read("src/app/(app)/admin/audit/page.tsx");
    expect(src).toMatch(/title=\{[\s\S]*?log\.entityId/);
  });

  it("#6: Recent sessions panel uses Session id / Device fingerprint labels", () => {
    const src = read("src/app/(app)/admin/users/[userId]/page.tsx");
    expect(src).toContain("Session id");
    expect(src).toContain("Device fingerprint");
    // The ip:/ua: prefix is stripped on display.
    expect(src).toContain('replace(/^[a-z]+:/i, "")');
  });

  it("#8: scheduling/routes/new humanises driver role enum", () => {
    const src = read("src/app/(app)/scheduling/routes/new/page.tsx");
    expect(src).toContain("formatRole(u.role)");
    expect(src).not.toMatch(/\{u\.name\} \(\{u\.role\}\)/);
  });

  it("broad sweep — no UI file interpolates a bare .role into JSX", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx)$/.test(entry)) continue;
        if (/\.test\.tsx?$/.test(entry)) continue;
        const src = readFileSync(full, "utf8");
        // Strip humanise(...) and formatRole(...) wrapped expressions
        // before scanning for raw `.role` references in JSX text.
        const stripped = src
          .replace(/humanise\([^)]*\.role[^)]*\)/g, "")
          .replace(/formatRole\([^)]*\.role[^)]*\)/g, "")
          .replace(/\.role\s*[=:]/g, "")
          .replace(/role:\s*\w+/g, "")
          .replace(/role\s*===/g, "")
          .replace(/role\s*=\s*\{[^}]*\}/g, "");
        // Match: `{ ${u.role} }` or `{u.role}` etc. inside JSX
        // text spans (after a `>` and before a `<`).
        const re = />[^<>]{0,400}\{[A-Za-z_][A-Za-z0-9_.]*\.role\}[^<>]{0,400}</g;
        if (re.test(stripped)) {
          offenders.push(full.replace(`${ROOT}/`, ""));
        }
      }
    }
    walk(join(ROOT, "src/app"));
    walk(join(ROOT, "src/components"));
    expect(
      offenders,
      `Bare .role interpolations: ${offenders.join(", ")}. Wrap in humanise() or formatRole().`,
    ).toEqual([]);
  });
});

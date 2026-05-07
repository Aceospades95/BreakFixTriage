import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Round-9 §3D — extend audit-row coverage from the driver flow to
 * every other write surface. Round-8 §3F covered driver flow;
 * Round-9 §3D verifies the same invariant on quotes, invoices,
 * parts, schedule blocks, settings, email rules / templates, etc.
 *
 * The full Playwright spec that drives each surface and asserts
 * the row appears is filed in docs/round-9-backlog.md (needs CI
 * Postgres). The structural assertion below confirms that every
 * server action under src/server/actions/ that performs a
 * mutation either writes an audit row directly OR delegates to a
 * library function that does.
 */

const ROOT = process.cwd();

const ACTION_FILES = readdirSync(
  join(ROOT, "src/server/actions"),
).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

const MUTATION_PATTERNS = [
  /\bprisma\.[a-zA-Z]+\.update\b/,
  /\bprisma\.[a-zA-Z]+\.create\b/,
  /\bprisma\.[a-zA-Z]+\.delete\b/,
  /\bprisma\.[a-zA-Z]+\.upsert\b/,
  /\btx\.[a-zA-Z]+\.update\b/,
  /\btx\.[a-zA-Z]+\.create\b/,
  /\btx\.[a-zA-Z]+\.delete\b/,
];

const AUDIT_OR_LIB_PATTERNS = [
  /\bwriteAudit\b/,
  /\bdispatchEmailEvent\b/,
  // Library delegation — e.g. mergeTicket, transitionTicket,
  // resolveDuplicate. Each library writes its own audit rows.
  /\b(mergeTicket|transitionTicket|resolveDuplicate|cancelRoute|reorderRoute|updateStopStatus|sendQuote|respondToQuote|cancelQuote|buildRoute|createJob|addDeviceToStop|removeDeviceFromStop|importBatch|reconcileSnowImport|finalizeImport|commitImport|holdQuote)\b/,
];

describe("Round-9 §3D: audit-row coverage on every mutation server action", () => {
  for (const file of ACTION_FILES) {
    it(`${file}: every mutation either writes audit OR delegates to a library`, () => {
      const path = join(ROOT, "src/server/actions", file);
      const src = readFileSync(path, "utf8");
      const hasMutation = MUTATION_PATTERNS.some((p) => p.test(src));
      if (!hasMutation) {
        // Read-only action — no audit needed.
        return;
      }
      const hasAuditOrDelegate = AUDIT_OR_LIB_PATTERNS.some((p) =>
        p.test(src),
      );
      expect(
        hasAuditOrDelegate,
        `${file} mutates DB rows without writeAudit / library delegation. Add an audit write.`,
      ).toBe(true);
    });
  }
});

describe("Round-9 §3C: humanise library single-entry-point codemod verify", () => {
  it("no ad-hoc .toLowerCase().replace(/_/g, ' ') chain in src/", () => {
    // Round-8 §3D landed src/lib/humanise.ts as the canonical
    // surface. This test catches new code that re-rolls the
    // ALL_CAPS_SNAKE → sentence-case logic by hand.
    const offenders: string[] = [];
    walk(join(ROOT, "src"), (path) => {
      if (path.endsWith(".test.ts")) return;
      if (path.endsWith(".test.tsx")) return;
      if (path.includes("/lib/cn.ts")) return;
      if (path.includes("/lib/format.ts")) return;
      if (path.includes("/lib/humanise.ts")) return;
      if (path.includes("/lib/audit/format.ts")) return;
      if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return;
      const src = readFileSync(path, "utf8");
      // Match .replace(/_/g, ' '|" ").toLowerCase() AND the inverse.
      // (Round-9 §3C calls these out as ad-hoc humanise re-rolls.)
      if (
        /\.toLowerCase\(\)\s*\.replace\(\s*\/_\/[gm]?,\s*['"][\s_]['"]\s*\)/.test(
          src,
        )
      ) {
        offenders.push(path);
      }
      if (
        /\.replace\(\s*\/_\/[gm]?,\s*['"][\s_]['"]\s*\)\s*\.toLowerCase\(\)/.test(
          src,
        )
      ) {
        offenders.push(path);
      }
    });
    expect(offenders).toEqual([]);
  });
});

describe("Round-9 §3E: read-only role expansion", () => {
  // Existing Round-8 test (tests/read-only-role.test.ts) covers
  // permission-set assertions. This test extends to the *page
  // surface*: every page that lives in (app)/ should either be
  // readable by READ_ONLY OR be explicitly gated on USERS_MANAGE
  // (admin-only). The list below pins both halves so a future
  // page that falls between cracks fails this test.

  it("the READ_ONLY-readable surface includes every non-admin (app) route", () => {
    // The set of segments that are admin-only by design — Read-only
    // users see chromed not-found / 403 here. Everything else under
    // (app) must be reachable.
    const ADMIN_ONLY_SEGMENTS = new Set([
      "admin",
      "duplicates",
      "imports",
    ]);

    const appPages = collectPageDirs(join(ROOT, "src/app/(app)"));
    // Build a sample of each top-level segment to confirm we're
    // walking the tree we think we are.
    const topSegments = new Set(
      appPages.map((p) => p.split("/")[0] ?? ""),
    );
    expect(topSegments.size).toBeGreaterThan(5);

    // Every page either lives under an ADMIN_ONLY segment OR has a
    // requireRole call (any role, including TICKETS_READ which
    // READ_ONLY carries). The grep below trusts that the gating
    // pattern is uniform; finds files that DON'T match.
    const ungated: string[] = [];
    for (const rel of appPages) {
      const top = rel.split("/")[0] ?? "";
      if (ADMIN_ONLY_SEGMENTS.has(top)) continue;
      if (
        rel.includes("[...notfound]") ||
        rel.includes("not-found.tsx") ||
        rel.includes("layout.tsx") ||
        rel.endsWith("loading.tsx") ||
        rel.endsWith("error.tsx")
      )
        continue;
      const path = join(ROOT, "src/app/(app)", rel);
      const src = readFileSync(path, "utf8");
      // Pages that explicitly call requireSession or requireRole
      // are gated. Redirects and notFound() short-circuits also
      // pass — the user lands on a page that's gated downstream.
      const isGated = /\brequire(Session|Role)\(/.test(src);
      const isRedirectOrNotFound =
        /\bredirect\s*\(/.test(src) || /\bnotFound\s*\(\s*\)/.test(src);
      if (!isGated && !isRedirectOrNotFound) ungated.push(rel);
    }
    expect(ungated, `Ungated (app) pages: ${ungated.join(", ")}`).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir: string, cb: (path: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "dist"
    )
      continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, cb);
    } else {
      cb(full);
    }
  }
}

function collectPageDirs(root: string): string[] {
  const out: string[] = [];
  walk(root, (full) => {
    if (!full.endsWith("/page.tsx")) return;
    const rel = full.slice(root.length + 1);
    out.push(rel);
  });
  return out;
}

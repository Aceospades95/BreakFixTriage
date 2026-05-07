import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-8 §1C — every link on the chromed not-found pages must
 * resolve to a real route. Without a live Next.js runtime in CI we
 * cannot HTTP-request and assert 200; the structural assertion here
 * walks the hardcoded route lists in (app)/not-found.tsx and
 * (app)/admin/not-found.tsx and verifies each href maps to a real
 * `page.tsx` in the source tree. Catches the regression where a
 * destination grid entry points at a non-existent path.
 *
 * The full Playwright HTTP-level smoke that confirms each link
 * actually serves a 200 is filed in docs/round-8-backlog.md
 * alongside the broader nav-smoke crawler.
 */

const ROOT = process.cwd();

function pageExistsForHref(href: string): boolean {
  // Strip query / hash; ignore external links (we own none today).
  const path = href.split(/[?#]/)[0]!;
  if (!path.startsWith("/")) return true;
  const segments = path.replace(/^\/+|\/+$/g, "").split("/");

  // Walk known directory candidates: literal first, then dynamic
  // [..]/[...] folders. Returns true if any candidate has a
  // page.tsx.
  function walk(dir: string, idx: number): boolean {
    if (idx === segments.length) {
      return existsAt(join(dir, "page.tsx"));
    }
    const seg = segments[idx]!;
    // Try literal child segment.
    const literal = join(dir, seg);
    if (existsAt(literal) && walk(literal, idx + 1)) return true;
    // Try a dynamic segment ([param]) by listing the dir.
    let entries: string[] = [];
    try {
      entries = require("fs").readdirSync(dir);
    } catch {
      return false;
    }
    for (const child of entries) {
      if (
        (child.startsWith("[") && child.endsWith("]")) ||
        child === "(app)" ||
        (child.startsWith("(") && child.endsWith(")"))
      ) {
        const full = join(dir, child);
        if (require("fs").statSync(full).isDirectory()) {
          if (walk(full, child.startsWith("(") ? idx : idx + 1)) return true;
        }
      }
    }
    return false;
  }

  function existsAt(p: string): boolean {
    try {
      require("fs").statSync(p);
      return true;
    } catch {
      return false;
    }
  }

  // App root is src/app — scan from there.
  return walk(join(ROOT, "src/app"), 0);
}

function extractHrefs(src: string): string[] {
  const hrefs: string[] = [];
  const re = /href:\s*"(\/[^"]*)"|href="(\/[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    hrefs.push((m[1] ?? m[2])!);
  }
  return hrefs;
}

describe("Round-8 §1C: chromed not-found grids reach real routes", () => {
  it("every link on (app)/not-found.tsx resolves to a real page.tsx", () => {
    const src = readFileSync(
      join(ROOT, "src/app/(app)/not-found.tsx"),
      "utf8",
    );
    const hrefs = extractHrefs(src);
    expect(hrefs.length).toBeGreaterThan(0);
    const broken = hrefs.filter((h) => !pageExistsForHref(h));
    expect(
      broken,
      `Broken hrefs in (app)/not-found.tsx: ${broken.join(", ")}`,
    ).toEqual([]);
  });

  it("every link on (app)/admin/not-found.tsx resolves to a real page.tsx", () => {
    const src = readFileSync(
      join(ROOT, "src/app/(app)/admin/not-found.tsx"),
      "utf8",
    );
    const hrefs = extractHrefs(src);
    expect(hrefs.length).toBeGreaterThan(0);
    const broken = hrefs.filter((h) => !pageExistsForHref(h));
    expect(
      broken,
      `Broken hrefs in (app)/admin/not-found.tsx: ${broken.join(", ")}`,
    ).toEqual([]);
  });
});

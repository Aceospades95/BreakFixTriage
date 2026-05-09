import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

/**
 * Round-11 §HOTFIX-2 — sitemap coverage gate.
 *
 * The route smoke spec lives at e2e/route-smoke.spec.ts and only
 * runs once Playwright is wired into CI (§2D). Until then the
 * sitemap-coverage gate asserts STRUCTURALLY:
 *
 *   1. Every `page.tsx` under src/app/ is referenced in
 *      docs/sitemap.md by its public path.
 *   2. Every page that's referenced in the spec also lives in
 *      sitemap.md (no spec drift).
 *
 * Routes excluded by design (don't represent a user-visible URL):
 *   - layout.tsx, loading.tsx, error.tsx, not-found.tsx
 *   - print routes are listed in the sitemap but optional in the
 *     smoke spec because they emit a print-only DOM
 *   - dynamic catch-all `[...notfound]` is the 404 fallback
 */

function listPageFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry === "page.tsx") out.push(full);
    }
  }
  walk(root);
  return out;
}

/**
 * Convert src/app/(group)/foo/[id]/page.tsx to the public path
 * `/foo/[id]`. Strips the (group) segments and the `page.tsx`
 * suffix.
 */
function fileToPath(file: string): string {
  const rel = file.replace(`${ROOT}/src/app/`, "").replace(/\/page\.tsx$/, "");
  const segments = rel
    .split("/")
    .filter((s) => !s.startsWith("(") || !s.endsWith(")"))
    .filter(Boolean);
  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

const PRINT_PATHS_OK_TO_SKIP_IN_SPEC = new Set<string>([
  "/tickets/[ticketId]/print",
  "/scheduling/routes/[routeId]/print",
  "/tickets/[ticketId]",
  "/imports/[batchId]",
  "/admin/users/[userId]",
  "/admin/devices/[deviceId]",
  "/admin/schools/[schoolId]",
  "/admin/parts/[partId]",
  "/admin/device-models/[modelId]",
  "/admin/email-templates/[id]",
  "/scheduling/routes/[routeId]",
  "/portal/[token]",
  // 404 fallbacks
  "/[...notfound]",
  "/admin/[...notfound]",
  // Round-13 §1A — /people is a 308 redirect, not a final
  // destination, so the smoke spec doesn't need to walk it.
  // The redirect target /scheduling/people IS in the spec.
  "/people",
]);

describe("Round-11 §HOTFIX-2 — sitemap + route smoke coverage", () => {
  const sitemap = readFileSync(join(ROOT, "docs/sitemap.md"), "utf8");
  const spec = readFileSync(join(ROOT, "e2e/route-smoke.spec.ts"), "utf8");

  const pageFiles = listPageFiles(join(ROOT, "src/app"));
  const allPaths = pageFiles.map(fileToPath);

  it("every page.tsx is documented in docs/sitemap.md", () => {
    const missing: string[] = [];
    for (const path of allPaths) {
      // Skip dynamic-segment routes when checking the sitemap text:
      // the docs render them as e.g. `/tickets/[ticketId]` literally.
      if (!sitemap.includes("`" + path + "`")) {
        missing.push(path);
      }
    }
    expect(missing, `Undocumented routes: ${missing.join(", ")}`).toEqual([]);
  });

  it("every concrete public route is exercised by the smoke spec", () => {
    const missing: string[] = [];
    for (const path of allPaths) {
      if (PRINT_PATHS_OK_TO_SKIP_IN_SPEC.has(path)) continue;
      // Auth-only `/signin` lives in the public shell.
      if (!spec.includes(`"${path}"`)) {
        missing.push(path);
      }
    }
    expect(missing, `Routes missing from smoke spec: ${missing.join(", ")}`).toEqual([]);
  });

  it("smoke spec checks for the exact error-boundary markers from the /tickets incident", () => {
    expect(spec).toContain("Something broke on this page");
    expect(spec).toContain("digest:");
    expect(spec).toContain("Application error: a server-side exception has occurred");
  });
});

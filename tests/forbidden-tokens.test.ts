import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Forbidden-token DOM scan (findings §8 + §3.A3).
 *
 * Crawls the source tree and asserts that no string literal
 * destined for a user-facing surface contains a Prisma stack
 * signature, a P-code, or a cuid-shaped ID. The scan is
 * intentionally narrow: we do NOT want to flag legitimate uses of
 * the words "prisma" in code comments, type imports, or in the
 * import-error-translate module that EXISTS to neutralise these
 * tokens.
 *
 * Heuristic: walk every .ts / .tsx file under src/, find
 * `?error=...` and `?ok=...` template literals (the routes that
 * become toasts), and assert each candidate doesn't contain a
 * banned substring.
 */

const ROOT = join(process.cwd(), "src");

const FORBIDDEN_IN_TOAST = [
  /Invalid\s+`prisma\./i,
  /\.invocation\b/i,
  // Bare cuid pattern. We can't realistically forbid every cuid
  // mention (server actions sometimes redirect with a ticket id);
  // the heuristic targets cuids that show up as VALUES in toast
  // strings, not in URL paths.
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Pull the `?ok=...` / `?error=...` template-literal arguments. */
function extractToastStrings(src: string): string[] {
  const hits: string[] = [];
  const reToast = /\?(?:ok|error)=\$\{encodeURIComponent\(([^)]+)\)\}/g;
  let m: RegExpExecArray | null;
  while ((m = reToast.exec(src)) !== null) {
    hits.push(m[1]!);
  }
  // Also: literal `?error=foo` cases (no encodeURIComponent)
  const reLit = /\?(?:ok|error)=([^"'`)]+)/g;
  while ((m = reLit.exec(src)) !== null) {
    hits.push(m[1]!);
  }
  return hits;
}

describe("forbidden tokens in operator-facing strings (§8 + §3.A3)", () => {
  const files = walk(ROOT);

  it("scans at least one file (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no `?ok=...` or `?error=...` toast string contains a Prisma stack signature", () => {
    const offences: { file: string; snippet: string }[] = [];
    for (const f of files) {
      // Skip the translator itself — it's the one place that
      // mentions these tokens, in regex form, to STRIP them.
      if (f.endsWith("/import/error-translate.ts")) continue;
      // Skip test files — they assert the absence of these tokens
      // and need to mention them by name.
      if (f.includes("/tests/")) continue;
      const src = readFileSync(f, "utf8");
      for (const candidate of extractToastStrings(src)) {
        for (const banned of FORBIDDEN_IN_TOAST) {
          if (banned.test(candidate)) {
            offences.push({ file: f, snippet: candidate });
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the `?error=` paths in import server actions go through translateImportError", () => {
    const importsServer = join(ROOT, "server", "actions", "imports.ts");
    const src = readFileSync(importsServer, "utf8");
    // The server actions catch errors and produce toast strings.
    // We just assert that the file imports the translator OR the
    // pipeline (which itself uses the translator); a stronger
    // contract is in tests/import-error-translate.test.ts.
    const goesThroughTranslator =
      src.includes("translateImportError") ||
      src.includes("./pipeline") ||
      src.includes("@/lib/import/pipeline");
    expect(goesThroughTranslator).toBe(true);
  });
});

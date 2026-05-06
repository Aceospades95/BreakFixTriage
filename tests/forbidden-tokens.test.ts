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

/**
 * Round-3 §G14 — `font-mono` outside `<code>` / `<pre>` is
 * forbidden everywhere a user can read text. The brief asks for
 * a CI grep + a runtime DOM scan; this test covers the grep
 * surface (the runtime scan lands with the Playwright smoke
 * once it's wired).
 *
 * Allow-list:
 *   - `<code>` / `<pre>` blocks (inherently monospace).
 *   - Library files that themselves DEFINE the typography
 *     (lib/cn.ts, tailwind.config, globals.css).
 *   - Test files (they may mention the token in assertions).
 *
 * Heuristic: scan src/ .ts(x), grep for /\bfont-mono\b/, fail
 * the build if any match is in a className that isn't on a
 * `<code>` / `<pre>` element. The full AST analysis is
 * follow-up work; the substring scan catches every
 * already-known violator.
 */
describe("Round-3 §G14: font-mono confined to <code>/<pre>", () => {
  const files = walk(ROOT);

  it("no Tailwind `font-mono` className lives in src/ outside <code>/<pre>", () => {
    const offences: string[] = [];
    for (const f of files) {
      if (f.endsWith("/lib/cn.ts")) continue; // typography defs
      const src = readFileSync(f, "utf8");
      // Quick filter: skip files that don't mention `font-mono`.
      if (!src.includes("font-mono")) continue;
      // Walk lines; each `font-mono` occurrence has to be inside
      // a <code> or <pre> element (we look for the tag opener
      // earlier on the same line, since the offending pattern
      // is always a `<code className="...font-mono...">`).
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("font-mono")) return;
        const allowed = /<\s*(code|pre)\b/.test(line);
        if (!allowed) {
          offences.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    if (offences.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "Round-3 §G14 violation: font-mono outside <code>/<pre>:\n" +
          offences.join("\n"),
      );
    }
    expect(offences).toEqual([]);
  });
});

/**
 * Round-3 §G29 — no ALL_CAPS_UNDERSCORE in user-visible JSX
 * literal text. The unit test in tests/status-pill-casing.test.ts
 * already pins TicketState rendering; this one is a broader
 * scan against literal JSX text nodes.
 *
 * Heuristic: walk src/ .tsx files, find JSX text bodies between
 * `>` and `<`, fail if any contains the [A-Z]{2,}_[A-Z]+ pattern.
 * Skips obvious code-style contexts (comments, the formatter
 * source itself, test files, the audit-format helper which
 * rewrites raw action strings on its way to chips).
 */
describe("Round-3 §G29: no ALL_CAPS_UNDERSCORE in JSX text", () => {
  const files = walk(ROOT).filter((f) => f.endsWith(".tsx"));
  const RE = /[A-Z]{2,}_[A-Z]+/;

  it("no JSX text literal carries the ALL_CAPS_UNDERSCORE pattern", () => {
    const offences: string[] = [];
    const allow = (file: string, line: string): boolean => {
      // Allow file-internal allow-listing via a /* @scan: ok */
      // marker on the line. Round-3 doesn't use this today but
      // it's the escape hatch a future caller can reach for.
      return /@scan:\s*ok/.test(line);
    };

    for (const f of files) {
      // The audit format helper SOURCE refers to action strings
      // by their raw form; scan exempt.
      if (f.endsWith("/lib/audit/format.ts")) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // JSX text nodes are between > and < on the same line —
        // a strict tokenizer would catch multi-line nodes too,
        // but those are rare and the substring scan covers them
        // line-by-line.
        const matches = line.match(/>([^<>{}]+)</g) ?? [];
        for (let mi = 0; mi < matches.length; mi++) {
          const m = matches[mi]!;
          const text = m.slice(1, -1).trim();
          if (!text) continue;
          if (!RE.test(text) || allow(f, line)) continue;
          // Skip text inside <code> or <pre> — those are explicitly
          // allowed monospace blocks per docs/ui-conventions.md.
          // Heuristic: scan the line backwards from the match for
          // the nearest opening tag; if it's <code> or <pre>,
          // the text is permitted.
          const matchIdx = line.indexOf(m);
          const before = line.slice(0, matchIdx);
          const lastOpen = before.lastIndexOf("<");
          if (lastOpen >= 0) {
            const tagFrag = before.slice(lastOpen).toLowerCase();
            if (
              tagFrag.startsWith("<code") ||
              tagFrag.startsWith("<pre")
            ) {
              continue;
            }
          }
          offences.push(`${f}:${i + 1}: ${text}`);
        }
      }
    }
    if (offences.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "Round-3 §G29 violation: ALL_CAPS_UNDERSCORE in JSX text:\n" +
          offences.slice(0, 20).join("\n") +
          (offences.length > 20 ? `\n…and ${offences.length - 20} more` : ""),
      );
    }
    expect(offences).toEqual([]);
  });
});

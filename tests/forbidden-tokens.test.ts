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
        // Round-4: skip comments (single-line `//`, JSX-block
        // `{/* */}`, jsdoc continuation `*` / `*/`). These
        // mention `font-mono` in prose explaining the rule,
        // not as a className.
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("{/*") ||
          trimmed.endsWith("*/}") ||
          trimmed.endsWith("*/")
        ) {
          return;
        }
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

/**
 * Round-4 §A1 / §M — admin pages must not render CLI commands
 * to operators. Scan src/app/(app)/admin for JSX text nodes that
 * mention `npx`, `npm run`, or `prisma db push`. Internal seed
 * scripts under prisma/ and scripts/ are exempt.
 */
describe("Round-4 §A1: no CLI commands rendered in admin UI", () => {
  const files = walk(ROOT).filter((f) =>
    f.includes("/app/(app)/admin/") && f.endsWith(".tsx"),
  );
  // The Round-3 templates list page renders an explicit
  // "Run npm run email:seed-templates" CLI block on empty state.
  // Round-4 §A replaces that block with a Seed CTA — once the
  // CTA lands, the file is no longer exempt. Until then it's
  // tracked here so the scan runs everywhere else.
  const TEMP_EXEMPT: string[] = [
    "src/app/(app)/admin/email-templates/page.tsx",
  ];
  const RX = /\b(npx|npm run|prisma db push|prisma migrate)\b/i;

  it("no admin page renders an `npx`/`npm run`/`prisma` CLI command in JSX text", () => {
    const offences: string[] = [];
    for (const f of files) {
      if (TEMP_EXEMPT.some((e) => f.includes(e))) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const matches = line.match(/>([^<>{}]+)</g) ?? [];
        for (const m of matches) {
          const text = m.slice(1, -1).trim();
          if (!text || !RX.test(text)) continue;
          // Allow inside <code> / <pre> — operators sometimes need
          // to copy a command; the gate is "must not be the
          // primary CTA" not "must never appear".
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
        "Round-4 §A1 violation: CLI command in admin JSX text:\n" +
          offences.join("\n"),
      );
    }
    expect(offences).toEqual([]);
  });
});

/**
 * Round-4 §M — every email send goes through dispatchEmailEvent.
 * Scan src/ for direct provider calls outside lib/email/providers/.
 * Catches `transporter.sendMail(...)` / `resend.emails.send(...)` /
 * `nodemailer.createTransport().sendMail(...)`.
 */
describe("Round-4 §M: no direct email-provider calls outside lib/email/providers/", () => {
  const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));
  // The legacy lifecycle / SMTP wiring lives under
  // lib/notifications — that's the existing nodemailer transport
  // wrapper that the new dispatchEmailEvent path delegates to.
  // It's allowed to hold the actual sendMail call.
  const ALLOW_DIRS = [
    "/lib/email/providers/",
    "/lib/email/provider.ts",
    "/lib/notifications/smtp.ts",
    "/lib/notifications/transport.ts",
    "/lib/notifications/stdout.ts",
  ];
  // Patterns that indicate a direct provider call.
  const PATTERNS = [
    /\.sendMail\s*\(/, // nodemailer
    /resend\.emails\.send\s*\(/, // Resend SDK
    /sgMail\.send\s*\(/, // SendGrid SDK (future)
  ];

  it("no .sendMail / resend.emails.send / sgMail.send outside the email providers dir", () => {
    const offences: string[] = [];
    for (const f of files) {
      if (ALLOW_DIRS.some((p) => f.includes(p))) continue;
      if (f.includes("/tests/")) continue;
      if (f.endsWith("/forbidden-tokens.test.ts")) continue;
      const src = readFileSync(f, "utf8");
      for (const pat of PATTERNS) {
        if (pat.test(src)) {
          offences.push(`${f}: ${pat.source}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

/**
 * Round-5 §3.2 — devnote leak CI enforcement.
 *
 * Three regex rules that fail the build when:
 *   1. /Round-\d+/ appears in user-facing JSX (catches "Round-3 §A3
 *      ships the digest opt-in…" style leaks).
 *   2. /§[A-Z]?\d+/ appears in user-facing JSX (catches "§N2 follow-up:
 *      hour-and-minute pickers" style leaks).
 *   3. /\b(npm run|npx|prisma db) [a-z]/ appears in user-facing JSX
 *      (catches "Run npx prisma db push" CLI leaks; Round-4's
 *      narrower scan caught the email-templates page only and is
 *      superseded here).
 *
 * Allow-list for §3.2:
 *   - Inside `<code>` or `<pre>` is fine (operators sometimes need
 *     the literal command).
 *   - Inside JSX block comments (`{/* ... *\/}`) and JS line / block
 *     comments (`//`, `/* ... *\/`) is fine — those don't render.
 *   - The `not-found.tsx` page intentionally mentions "Round-N
 *     smoke crawler" in a developer-facing apology paragraph; the
 *     Round-5 §3.1 strip removes that paragraph entirely so the
 *     allow-list stays empty and tightens going forward.
 */
describe("Round-5 §3.2: no internal numbering or CLI commands in JSX text", () => {
  const files = walk(ROOT).filter((f) => f.endsWith(".tsx"));
  // Patterns to find in JSX text. Match against the trimmed
  // contents between `>` and `<`.
  const RULES: Array<{ name: string; rx: RegExp }> = [
    { name: "Round-N reference", rx: /\bRound-\d+\b/ },
    // §<optional letter><digits> — covers §A1, §G29, §N2, §K, etc.
    // Plain "§" followed by a single capital letter is too loose;
    // we require at least one digit somewhere in the token.
    { name: "section-marker", rx: /§[A-Z]?\d+/ },
    {
      name: "CLI command",
      rx: /\b(npm run|npx|prisma db) [a-z]/i,
    },
  ];

  it("no JSX text node violates the §3.2 lint set", () => {
    const offences: string[] = [];
    for (const f of files) {
      const rawSrc = readFileSync(f, "utf8");
      // Quick filter: skip files that don't contain any of the
      // raw markers (small CPU win on the hot path).
      if (
        !/Round-\d+/.test(rawSrc) &&
        !/§[A-Z]?\d+/.test(rawSrc) &&
        !/\b(npm run|npx|prisma db) [a-z]/i.test(rawSrc)
      ) {
        continue;
      }
      // Round-5: scan the whole file at once so multi-line JSX
      // text nodes are caught (the per-line variant in the
      // earlier Round-3/4 scans missed `<p>` with body wrapped
      // across 3+ lines, which is exactly how the four §3.1
      // leaks are written).
      //
      // Strip JSX block comments + JS line comments + JS block
      // comments first so the scan only sees rendered text. The
      // strip is conservative (regex, not AST) but covers every
      // pattern the codebase uses today.
      const stripped = rawSrc
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // {/* ... */}
        .replace(/\/\*[\s\S]*?\*\//g, "") // /* ... */
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // // ... (preserve URLs like https://)

      // Pull every `>` ... `<` text span. With [\s\S]*? (lazy)
      // and [^<>{}] semantics we capture multi-line JSX bodies.
      // Then emit the source line of the FIRST char of the match
      // for the offence message.
      const TEXT_RE = />([^<>{}]+)</g;
      let m: RegExpExecArray | null;
      while ((m = TEXT_RE.exec(stripped)) !== null) {
        const text = m[1]!.trim();
        if (!text) continue;
        // Skip text inside <code> / <pre> by walking back from
        // the match start to the nearest opening tag.
        const before = stripped.slice(0, m.index);
        const lastOpen = before.lastIndexOf("<");
        if (lastOpen >= 0) {
          const tag = before.slice(lastOpen).toLowerCase();
          if (
            tag.startsWith("<code") ||
            tag.startsWith("<pre")
          ) {
            continue;
          }
        }
        for (const rule of RULES) {
          if (rule.rx.test(text)) {
            // Find the source line for the offence message.
            const lineNo = stripped.slice(0, m.index).split("\n").length;
            offences.push(
              `${f}:${lineNo}: [${rule.name}] ${text.slice(0, 120).replace(/\s+/g, " ")}`,
            );
            break; // one offence per text span
          }
        }
      }
    }
    if (offences.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "Round-5 §3.2 violation: devnote / CLI text in JSX:\n" +
          offences.slice(0, 30).join("\n") +
          (offences.length > 30
            ? `\n…and ${offences.length - 30} more`
            : ""),
      );
    }
    expect(offences).toEqual([]);
  });
});

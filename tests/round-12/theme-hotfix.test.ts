import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1G hotfix + §2K — regression gates for the two bugs
 * caught on the deployed §1G commit.
 *
 *   §1G hotfix — data-theme-resolved="pending" was being shipped
 *                from the server, AND globals.css had bare :root
 *                selectors that fired in dark mode and turned
 *                slate-300 muted text into slate-700 (invisible
 *                on dark backgrounds).
 *
 *   §2K        — SLA chip "0d" wrapped to two lines because the
 *                className lacked whitespace-nowrap.
 */

describe("Round-12 §1G hotfix — data-theme-resolved=pending leak", () => {
  it("root layout never ships data-theme-resolved=\"pending\"", () => {
    const src = read("src/app/layout.tsx");
    // The fix: when themeClass is null, the attribute is omitted
    // (undefined). NEVER hardcoded to "pending" as the JSX value.
    expect(src).toContain("data-theme-resolved={themeClass ?? undefined}");
    // The string "pending" must not appear as a JSX attribute value
    // or fallback expression. Comments may explain the absence.
    expect(src).not.toMatch(/data-theme-resolved=["{][^}]*"pending"/);
    expect(src).not.toMatch(/themeClass\s*\?\?\s*["']pending["']/);
  });

  it("anti-flash script sets data-theme-resolved synchronously", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toContain(
      "html.setAttribute('data-theme-resolved', resolved)",
    );
    // Script also resolves system mode via prefers-color-scheme
    // before paint.
    expect(src).toMatch(/window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  });

  it("no CSS file references data-theme-resolved=\"pending\"", () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          out.push(...walk(full));
          continue;
        }
        if (/\.(css|tsx|ts)$/.test(entry)) out.push(full);
      }
      return out;
    }
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, "src"))) {
      const src = readFileSync(f, "utf8");
      // Reject any selector or attribute string keyed on the
      // "pending" sentinel value.
      if (
        /data-theme-resolved=["']pending["']/.test(src) ||
        /\[data-theme-resolved=pending\]/.test(src) ||
        /\[data-theme-resolved="pending"\]/.test(src)
      ) {
        offenders.push(f.replace(`${ROOT}/`, ""));
      }
    }
    expect(
      offenders,
      `data-theme-resolved="pending" must never appear in source; offenders: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("Round-12 §1G hotfix — dark-mode CSS remap leak", () => {
  const css = read("src/app/globals.css");

  it("light-mode slate remaps are scoped to :root:not(.dark) (or .light)", () => {
    // A line like ":root .text-slate-300 { ... }" without any
    // class qualifier matches ALL elements under <html>,
    // including in dark mode. The hotfix replaced these with
    // ":root:not(.dark) .text-slate-300" so the remap is gated.
    const offenders: string[] = [];
    const lines = css.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Match a selector that starts with ":root " (bare) followed
      // by a Tailwind utility class. False positives on
      // ":root:not(.dark)" or ":root.light" or ":root,..." are
      // excluded.
      if (/^\s*:root\s+\.(text-|bg-)/.test(line)) {
        offenders.push(`line ${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(
      offenders,
      `Bare ":root .utility" selectors fire in dark mode too. Use :root:not(.dark) ...`,
    ).toEqual([]);
  });

  it("text-slate-* remaps gate on :not(.dark)", () => {
    // Sanity check: the slate-300 remap is present + correctly
    // scoped. The previous shape had ":root .text-slate-300, :root.light .text-slate-300"
    // which fired in dark mode too.
    expect(css).toMatch(
      /:root:not\(\.dark\)\s+\.text-slate-300\s*\{\s*color:\s*rgb\(51 65 85\)/,
    );
    expect(css).toMatch(
      /:root:not\(\.dark\)\s+\.text-slate-100\s*\{/,
    );
    expect(css).toMatch(
      /:root:not\(\.dark\)\s+\.text-slate-400\s*\{/,
    );
    expect(css).toMatch(
      /:root:not\(\.dark\)\s+\.text-white\s*\{/,
    );
  });

  it("status-color remaps (amber/red/emerald/violet/indigo/blue) gate on :not(.dark)", () => {
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-amber-100/);
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-red-100/);
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-emerald-100/);
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-violet-200/);
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-indigo-200/);
    expect(css).toMatch(/:root:not\(\.dark\)\s+\.text-blue-200/);
  });

  it("dark mode keeps its own --color-* values under :root.dark", () => {
    expect(css).toMatch(
      /:root\.dark\s*\{[\s\S]*?--color-background:\s*17 25 39/,
    );
  });
});

describe("Round-12 §2K — SLA chip whitespace-nowrap", () => {
  const src = read("src/components/sla-badge.tsx");

  it("SlaBadge className includes whitespace-nowrap", () => {
    expect(src).toContain("whitespace-nowrap");
    // The fix lives next to the existing inline-flex baseline
    // class so the chip renders on a single line.
    expect(src).toMatch(/inline-flex items-center whitespace-nowrap/);
  });

  it("SlaBadge renders \"{days}d\" / label inline, not block", () => {
    // The render pattern is `{compact ? \`${days}d\` : label}`.
    // No inline <br> or block-level wrapping that could force a
    // wrap independent of whitespace-nowrap.
    expect(src).toMatch(/compact \? `\$\{days\}d` : label/);
  });
});

describe("Round-12 §1G hotfix — Playwright assertion", () => {
  const spec = read("e2e/theme-picker.spec.ts");

  it("e2e/theme-picker.spec.ts asserts data-theme-resolved is never \"pending\"", () => {
    expect(spec).toContain('data-theme-resolved');
    expect(spec).toMatch(/never expected "pending"/);
    expect(spec).toMatch(/expect\(\["light", "dark"\]\)\.toContain\(resolved\)/);
  });
});

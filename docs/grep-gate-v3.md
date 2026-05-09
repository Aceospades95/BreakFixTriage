# Grep gate v3 (Round-11 §2G)

The `scripts/check-forbidden-tokens.sh` walks every `*.ts` /
`*.tsx` under `src/` and rejects user-visible JSX text that
violates a documented rule. Mirrors `tests/forbidden-tokens.test.ts`
so a violation flunks both gates.

## Rules

### Rule 1 — `font-mono` outside `<code>` / `<pre>`

The `font-mono` Tailwind utility renders text in a monospace
typeface. Used inside `<code>` or `<pre>` it's correct; used in
prose it's a leak from a developer-facing context.

**Source**: `tests/forbidden-tokens.test.ts → font-mono not in JSX text`
**Lookback window**: 200 chars.

### Rule 2 — `ALL_CAPS_UNDERSCORE` enums in JSX text + text props

A token like `IN_PROGRESS` rendered in user prose betrays an
unhumanised enum. `humanise()` exists for this; the gate forces
its use.

Also enforced inside `placeholder`, `title`, `aria-label`,
`description`, `helperText`, `label` props.

### Rule 3 — Raw cuid in JSX text (cm-prefix)

`cm[a-z0-9]{20+}` is the Prisma cuid format. Rendering one in
prose means a missing humaniseEntity() call — operators see
gibberish instead of the entity's display name.

### Rule 3b (R11 §2G) — Broad cuid in JSX text

`c[a-z0-9]{24}` is the broader cuid pattern, catching synthetic
test ids and any non-Prisma cuid surface. Same fix as rule 3.

### Rule 4 — Bare CLI commands in JSX text

`npm run`, `pnpm`, `yarn`, `prisma`, `npx`, `tsx scripts/` in
operator copy reads as a developer instruction. Operators don't
have shell access; the message is unactionable. Move to docs.

### Rule 5 — Known enum values without underscores

A whitelist of single-word enums (`DRAFT`, `SENT`, `APPROVED`,
`PICKUP`, `LOW`, `NORMAL`, etc.) that `Rule 2` misses because
they have no underscore. Same fix: `humanise()`.

### Rule 6 — Devnotes / `Round-N` / `redeploy`

Round-8 §1B caught these in operator copy:

- `on the roadmap` — devnote read as a promise by operators
- `Round-N` — round identifier leaking into user-visible copy
- `redeploy` — developer action mentioned to non-developers

### Rule 7 — URL paths in JSX prose

Round-11 §2G extends from `/(admin|profile|me|scheduling|duplicates|imports)/x`
to also include `/tickets`, `/bench`, `/dashboards`. URL paths
belong in `href` attributes, not in the visible text content.

### Rule 8 — Hardcoded year literals

Round-10 §3F. Catches `\b20[2-9][0-9]\b` in JSX text. Use
`new Date().getFullYear()` so copyright footers and year-in-copy
stay current.

Allowlist: `components/audit/*` (formatted timestamps),
`lib/seed/holidays.ts` (legitimately enumerates years).

### Rule 9 (R11 §2G) — `digest:` leak

`digest:` is the prefix Next.js error boundaries emit for the
error reference id. Finding it in normal JSX text means an error
page string accidentally bled into a regular page's copy. The
/tickets SSR incident (digest=3087090167) is the canonical bug
class this rule guards against.

## Allowlist

`.cigrep-allow` is one regex per line. A token matching any
allowlist regex is suppressed. Use sparingly — drift is hidden
behind the allowlist.

## Failing the gate

Local run: `bash scripts/check-forbidden-tokens.sh`. Exit code 1
on any violation; lists every offence with file + line.

CI: the `forbidden-tokens` job in `.github/workflows/ci.yml` runs
the same script.

Vitest: `tests/forbidden-tokens.test.ts` reads the same source +
asserts the same rules so a watch-mode local run catches drift
without having to invoke the bash script.

## Adding a rule

1. Add the perl regex inside the per-file pass in
   `scripts/check-forbidden-tokens.sh`.
2. Add the matching `.toMatch` / `.not.toMatch` assertion in
   `tests/forbidden-tokens.test.ts` so vitest catches drift too.
3. Document the rule in this file with rationale.
4. Run the gate on the existing tree to confirm no false
   positives. Allowlist any genuine exceptions in `.cigrep-allow`.

## R11 §2G additions summary

| Rule | Pattern | Rationale |
|------|---------|-----------|
| url-in-prose | adds `/tickets /bench /dashboards` | bench card + Cmd+K palette regression class |
| cuid-broad | `c[a-z0-9]{24}` | catches synthetic and non-Prisma cuids that rule 3 misses |
| digest-leak | `\bdigest:` | the /tickets SSR incident leaked this string into the error boundary view |

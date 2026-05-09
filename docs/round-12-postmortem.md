# Round-12 postmortem — auto-seed deploy gap

## Severity

P1. Production functioning but operating in a degraded state:

- `/admin/email-rules` showed "0 rules · admin" with the
  empty-state seed banner — meaning no notifications were
  actually firing on any ticket lifecycle event.
- `/admin/email-templates` showed "0 templates available" — so
  even if a rule existed, dispatchEmailEvent had nothing to
  render.
- `/admin/holidays` showed "0 entries for 2026" — SLA
  business-hours math was billing weekends and federal holidays
  as work time.

For weeks, post-Round-11 deploy.

## Timeline

| When | Event |
|------|-------|
| Round-10 §2H | `seedDefaults()` first appeared — invoked from `prisma/seed.ts` only. Production never ran `npm run db:seed` so the function never fired. |
| Round-11 §1E | `seedDefaults()` extracted to `prisma/seed-defaults.ts` + `npm run db:seed:defaults` script + `docs/round-11-seed-audit.md` documented the production backfill path. The doc said: "After deploy, run npm run db:seed:defaults once." |
| Round-11 deploy | The operator never ran the script. EmailTemplate / EmailRule / Holiday tables stayed empty. |
| Round-12 recon | `/admin/email-rules` shows "0 rules · admin" with the seed banner. `/admin/holidays` shows "0 entries for 2026". |
| Round-12 §1A | Fixes the deploy gap: bootstrap.ts now calls seedDefaults() on every container start, AND a Prisma migration ships the same row set, AND the audit row writer tags each seed insert with `action='system_seed'`. |

## Root cause

The R11 path required a manual operator action (`npm run db:seed:defaults`)
that wasn't part of any deploy automation. The seed script existed,
the documentation existed, the npm script existed — but the
container start sequence in `Dockerfile`'s `CMD` was:

```
npx prisma db push --skip-generate \
  && npx tsx prisma/bootstrap.ts \
  && node node_modules/next/dist/bin/next start
```

`prisma/bootstrap.ts` only created the initial admin user. It
did NOT call `seedDefaults()`. The CMD also used `db push` not
`migrate deploy`, so any migration-time seed wouldn't have
fired either.

The R10 attempt to seed via `prisma/seed.ts` failed because
production never runs `npm run db:seed` — that script is for dev
fixture creation, not production bootstrap.

## What gate would have caught this?

None. `tsc`, vitest, the forbidden-tokens grep gate, the route
smoke spec — none of them inspect runtime database row counts
post-deploy. The R11 documentation existed but documentation is
a request, not a guarantee.

R12 adds three gates that close the loop:

1. **Bootstrap call** — `prisma/bootstrap.ts main()` now calls
   `seedDefaults(prisma)` after the admin-user setup. Bootstrap
   already runs on every container start. Idempotent so
   re-running is safe.

2. **Prisma migration** — `prisma/migrations/20260507000001_seed_defaults/migration.sql`
   inserts the same row set as a SQL migration. Any environment
   running `prisma migrate deploy` (CI, future production
   migration to migrate-deploy) gets the seed for free.

3. **Deploy verification script** — `scripts/verify-deploy.sh`
   curls `/admin/email-rules` and `/admin/holidays` post-deploy
   and asserts the empty-state banner is NOT present. Wires into
   the deploy workflow as a post-deploy CI gate (§3E).

## Lessons

- "Document the manual step" is a paper-trail solution, not a
  reliability solution. Wire the step into the automation or
  expect operators to forget.
- Bootstrap and migration are the two production deploy hooks
  that *will* fire. Anything else is opt-in and lossy.
- A post-deploy verification script that asserts on user-visible
  state catches the class of bug — a deploy "succeeded" but the
  product is broken.
- The fix is idempotent in three places. If any one path fires,
  the seed is in place.

## Lockstep file

`src/lib/holidays/federal.ts` and `prisma/lib/federal-holidays.ts`
are byte-for-byte identical (sans the docblock). The vitest gate
asserts this so a refactor of one without the other fails CI. The
duplication is intentional: the prisma/ copy stays self-contained
for the Docker runner image (which only copies `prisma/`, not
`src/`); the src/ copy is used by the `/admin/holidays` "Auto-seed"
kebab action which runs in the Next.js runtime.

## §1G — Theme picker half-implementation

Same class of bug as the auto-seed gap, different surface:
**the write path shipped, the read path was never wired**.

### Symptom

1. Sign in as Alex Admin. Visit `/me/preferences`.
2. Click Light → click Save preferences → toast: "Preferences saved".
3. Hard reload.
4. Page is still dark. `document.documentElement.className` is
   still `"dark"`. No `data-theme` attribute. No `theme` cookie.
   `localStorage.getItem('theme')` is null.
5. `getComputedStyle(document.body).backgroundColor` is still
   `rgb(17, 25, 39)` — the dark-surface token.

The write path persisted to `UserPreference.theme`. Reload still
showed dark because:

- The root layout (`src/app/layout.tsx`) hardcoded
  `cookies().get("bft_theme")?.value === "light" ? "light" : "dark"`
  with the dark fallback. It never read `UserPreference.theme`.
- The `/me/preferences` server action (`updatePreferencesAction`)
  wrote to the DB but never set the cookie that the layout
  actually consulted.
- There was no `ThemeProvider` client component to hydrate the
  preference from the DB.

Match-system happened to look correct only because the test
machine's OS was in dark mode. Light-OS users would have seen
the same root cause masked.

### Root cause

The "write path was added without an end-to-end test asserting
the DOM actually changed." A vitest gate that POSTs the
preferences form and inspects the rendered HTML would have caught
it; the existing test suite covered the DB write but not the
visual outcome.

### Fix (§1G)

1. **`resolveTheme()` helper** at `src/lib/theme/resolve.ts` —
   single source of truth. Priority: DB → `theme` cookie →
   legacy `bft_theme` cookie → `system` default.
2. **Root layout reads via resolveTheme()** — stamps `<html>`
   with `class="light"` / `class="dark"` / no class for system.
3. **Anti-flash inline `<script>` in `<head>`** — runs
   synchronously before paint; reads `prefers-color-scheme`; if
   no theme class is set yet (system mode), adds the matching
   class so there's no flash of wrong theme.
4. **`/api/me/theme` POST endpoint** — writes DB + sets the
   `theme` cookie + writes audit row `action=theme.update`.
   Returns `{ ok: true, theme }`. Anonymous → 401.
5. **Optimistic `<ThemePicker>` client component** — replaces
   the form-submit radio group on `/me/preferences`. Click
   immediately flips `<html>` class; POSTs in the background;
   reverts + shows error on failure. No Save button required;
   the digest form's Save button stays for digest fields.
6. **`globals.css` inverted** — light values are now in `:root`
   (default), dark values in `:root.dark` only. New semantic
   tokens (`--surface`, `--text`, `--text-muted`, `--accent`,
   `--ring`, etc.) point at the existing `--color-*` layer for
   lockstep without code churn.
7. **Header `<ThemeToggle>`** updated to write the new `theme`
   cookie (was `bft_theme`) and POST to `/api/me/theme` so
   signed-in users keep DB and cookie in sync from the quick-flip
   widget too.

### Gate added

`tests/round-12/theme-picker.test.ts` — 28 cases:

- Pure-function tests for `resolveTheme()` with every priority
  permutation
- Structural assertions on the layout / API route / picker
  client component / globals.css inversion
- Pins the cookie name `theme` + 1-year max-age + audit
  action `theme.update`

`e2e/theme-picker.spec.ts` is the live walk:
- Click Light → optimistic class flip within 100ms
- Reload → class persists from server-rendered DB read
- `getComputedStyle(body).backgroundColor` matches the light
  surface token
- Click Match system → `emulateMedia({ colorScheme: 'dark|light' })`
  flips the class without navigation
- Anonymous /signin → respects OS preference

### data-theme-resolved="pending" leak

Caught on the deployed `81f47d9` commit. Two distinct bugs in the
§1G implementation, both surfacing as "every page is now low-
contrast / nearly-invisible text on the sidebar + header chrome".

#### Bug A — server shipped `data-theme-resolved="pending"`

The root layout (R12 §1G commit) had:

```tsx
<html
  data-theme={theme}
  data-theme-resolved={themeClass ?? "pending"}  // <-- bug
>
```

For system-mode users the server-render emitted
`data-theme-resolved="pending"`. The intent was for the inline
anti-flash script to overwrite that with `light` / `dark` before
paint. Two problems with the original shape:

1. The inline script was only writing the `class` attribute, not
   `data-theme-resolved`. So the attribute stayed on `pending`
   forever after first paint.
2. Even if the script DID overwrite it, any CSS rule keyed on
   `[data-theme-resolved="pending"]` would have a brief
   first-paint window where it matched. Better to never ship the
   sentinel at all.

**Fix**: emit the attribute only when the server has a real
value. For system mode, the attribute is omitted (`undefined` in
JSX). The inline anti-flash script ALWAYS sets the attribute as
its first action, with the resolved `light` / `dark` value.

#### Bug B — globals.css bare `:root` selectors leaked into dark mode

This was the actual cause of the low-contrast symptom. The §1G.2
rewrite added rules of the form:

```css
:root .text-slate-300,
:root.light .text-slate-300 { color: rgb(51 65 85); }
```

`:root` matches `<html>` regardless of class. So on a dark-mode
page (`<html class="dark">`), `:root .text-slate-300` STILL
matches — `:root.dark` is just `:root` with an extra class. The
remap fired in dark mode and turned slate-300 muted text into
slate-700, which is nearly invisible against the slate-800 dark
sidebar background.

**Fix**: change every bare `:root` selector to `:root:not(.dark)`.
This scopes the remap to "anything that isn't explicitly dark"
— covers explicit `.light` AND the brief no-class window before
the anti-flash script runs.

The brief's diagnosis pointed at `data-theme-resolved="pending"`
as the cascade gate, but `grep -rn "data-theme-resolved" src/`
returned only the layout's own emitter — no CSS rule keyed on
it. The actual cascade leak was the bare `:root` selector. Both
bugs are fixed in the same hotfix commit because the brief
specifically requested both gates (drop the `pending` sentinel
AND audit any cascade keyed on it).

#### Gates added

- `tests/round-12/theme-hotfix.test.ts` — 10 cases:
  - layout never ships `"pending"` as a JSX value
  - inline script writes `data-theme-resolved` synchronously
  - no source file references `[data-theme-resolved="pending"]`
  - globals.css has no bare `:root .utility` selectors
  - every slate-* / status-color remap gates on `:not(.dark)`
- Playwright assertion in `e2e/theme-picker.spec.ts` walks every
  theme choice + reload and asserts `data-theme-resolved` is
  never `"pending"` (always `"light"`, `"dark"`, or `null`).

#### Why the original tests didn't catch this

The R12 §1G structural test (`tests/round-12/theme-picker.test.ts`)
verified that the layout STAMPED the `data-theme-resolved`
attribute, but didn't verify the value was ever non-`"pending"`.
The Playwright spec was gated on §1E runtime which CI runs but
local doesn't, so the visual symptom didn't surface in the
local triple-gate run.

Lesson: structural assertions on attribute presence aren't
enough — they must also pin the attribute's allowed value set.
Same lesson as §1A's "documented manual step is not a reliability
solution".

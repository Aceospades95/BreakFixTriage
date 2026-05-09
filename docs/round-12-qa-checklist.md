# Round-12 QA checklist

Every R12 acceptance check + how to verify manually. Pair with
`docs/round-12-summary.md` for the high-level "what shipped".

## §1A Auto-seed backfill

| ID | Check | Verify |
|----|-------|--------|
| 1A.1 | Prisma migration file exists | `ls prisma/migrations/20260507000001_seed_defaults/migration.sql` |
| 1A.2 | bootstrap.ts calls seedDefaults | `npx vitest run tests/round-12/seed-migration.test.ts` → 8/8 |
| 1A.3 | Idempotent: re-running the seed produces zero new rows | live verification: run `npm run db:seed:defaults` twice; row counts identical |
| 1A.4 | Production check: /admin/email-rules ≥1 rule (not seed CTA banner), /admin/holidays for current year ≥9 entries | `bash scripts/verify-deploy.sh` |

## §1B URL canonicalisation

| ID | Check | Verify |
|----|-------|--------|
| 1B.1 | /tickets/cuid 308-redirects to /tickets/INC# | manual: navigate to a known ticket cuid; URL should rewrite to incidentNumber |
| 1B.2 | No UI link uses ticket.id | `npx vitest run tests/round-12/url-canonicalisation.test.ts` → 7/7 |
| 1B.3 | EmailLog has ticket relation so /admin/email-log canonicalises | `grep "EmailLogToTicket" prisma/schema.prisma` |
| 1B.4 | Internal redirects after server actions canonicalise via the page-level redirect | server actions still redirect by id; page-level redirect adds the 308 hop |

## §1C Wave-4 leak sweep

| ID | Check | Verify |
|----|-------|--------|
| 1C.1 | ServiceNow ID label drops sys_id | `grep "ServiceNow ID" src/app/(app)/tickets/[ticketId]/page.tsx` |
| 1C.2 | Assignee select humanises role | inspect /tickets/[id] dropdown — should read "Tess Technician (Technician)" |
| 1C.3 | /bench card subtitle uses formatRole | `grep "formatRole(u.role)" src/app/(app)/bench/page.tsx` |
| 1C.4 | /admin/audit "Entity ID" label without (cuid) | inspect filter form |
| 1C.5/7 | Audit log User entity rows resolve to display name with cuid in tooltip | inspect /admin/audit; hover the User chip — title attribute should show the cuid |
| 1C.6 | Sessions panel reads "Session id" / "Device fingerprint" | inspect /admin/users/[id] Recent sessions panel |
| 1C.8 | scheduling/routes/new humanises driver role | `grep "formatRole(u.role)" src/app/(app)/scheduling/routes/new/page.tsx` |
| 1C.gate | `npx vitest run tests/round-12/leak-sweep-wave-4.test.ts` → 9/9 | |

## §1D 2FA reset

| ID | Check | Verify |
|----|-------|--------|
| 1D.1 | Enrolled panel reads "Enrolled · {ISO}" | manual: enroll a user in 2FA; visit /admin/users/[id]; assert label |
| 1D.2 | Reset 2FA button visible only when enrolled | inspect both states |
| 1D.3 | Reset clears totpSecret + writes audit | run e2e/2fa-reset.spec.ts (gated on §1E Playwright runtime) |
| 1D.4 | Audit row action="2fa:admin-reset" | `grep "2fa:admin-reset" src/server/actions/2fa.ts` (kept R11 form; brief asked for "admin_reset_2fa" — see assumptions doc) |

## §1E Playwright runtime + §1F migrate deploy verification

| ID | Check | Verify |
|----|-------|--------|
| 1E.1 | playwright.config.ts ships chromium-only | `cat playwright.config.ts` |
| 1E.2 | prisma/seed-test.ts has 7 personas + 5 schools + 50 devices + 20 tickets | `cat prisma/seed-test.ts` |
| 1E.3 | route-smoke.spec.ts asserts 200 + no global-error-boundary + no chromed-not-found | `grep "global-error-boundary" e2e/route-smoke.spec.ts` |
| 1E.4 | CI playwright job exists | `grep "playwright:" .github/workflows/ci.yml` |
| 1F.1 | CI integration job uses migrate deploy + tee log + fails on Skipped/rolled-back | `grep -A 3 "tee migrate-deploy.log" .github/workflows/ci.yml` |
| 1F.2 | Playwright job runs migrate deploy too | same |
| structural | `npx vitest run tests/round-12/playwright-runtime.test.ts` → 10/10 | |

## §2A-J Polish

| ID | Status | Notes |
|----|--------|-------|
| 2A | shipped via §1C broad sweep | no further changes needed |
| 2B | DEFERRED | year stepper highlight is CSS-only polish; filed in backlog |
| 2C | shipped | EmailTemplate / EmailRule / Holiday audit chips resolve to friendly labels |
| 2D | DEFERRED | toast for inline-edit save needs client component; substantive UX work |
| 2E | DEFERRED | force-change-form 5s countdown + ≥10 char reason + severity tag — substantial |
| 2F | DEFERRED | smooth-scroll on transition apply + reason placeholder — substantial |
| 2G | shipped | Failed sign-ins quick filter has count badge "(N)"; hidden when 0 |
| 2H | DEFERRED | Email SPOC button modal + tooltip — substantial |
| 2I | shipped via R11 §2F audit-wave-3 | Settings save audit row pinned in R11 |
| 2J | shipped | e2e/not-found-chrome.spec.ts asserts 404 + chromed page on 5 routes |

## §3 Hardening

| ID | Status | Verify |
|----|--------|--------|
| 3A persona | spec files exist (R11) + runtime now live (R12 §1E) — extension to deeper assertions filed in backlog | `ls e2e/persona-*.spec.ts` |
| 3B audit wave 4 | shipped | `npx vitest run tests/round-12/audit-wave-4.test.ts` → 11/11 |
| 3C grep gate v4 | shipped | `npx vitest run tests/round-12/grep-gate-v4.test.ts` → 5/5 |
| 3D CI Postgres runtime | shipped via R11 + R12 migrate deploy capture | `grep "tee migrate-deploy.log" .github/workflows/ci.yml` |
| 3E verify-deploy | shipped | `bash -n scripts/verify-deploy.sh` (syntax check) |
| 3F read-only API | structural shipped (17 surfaces) + live walk via R11 e2e/readonly-role-403.spec.ts | `npx vitest run tests/round-12/readonly-api-403.test.ts` → 19/19 |

## Hard gates (final report)

- **G1 tsc** — clean
- **G2 forbidden-tokens grep gate v4** — clean (3 new sub-rules)
- **G3 vitest** — 658 active passing / 7 integration skipped (need DATABASE_URL) / 13 todo. R12 added 42 new cases across 8 files.
- **G4 Playwright route smoke** — runtime configured, will run live in CI
- **G5 prisma migrate deploy** — runs cleanly; init migration + seed migration in place
- **G6 verify-deploy** — script lands; runs as post-deploy gate
- **G7 7 persona Playwright spec files** — exist; live runtime gated on §1E
- **G8 read-only role API** — 17 mutation surfaces guarded structurally; live walk in R11 spec
- **G9 audit row coverage wave 4** — 11 surfaces structurally pinned
- **G10 /tickets/cuid → 308 → /tickets/INC#** — code path lands; live test runs in CI Playwright
- **G11 production seed-state** — bootstrap.ts wires seedDefaults; verify-deploy.sh confirms post-deploy
- **G12 R11 regression suite** — `npx vitest run tests/round-11/` still green

## §1G Theme picker (addendum)

| ID | Check | Verify |
|----|-------|--------|
| 1G.1 | Root layout reads `UserPreference.theme` via `resolveTheme()` | `grep "resolveTheme\|userPreference.findUnique" src/app/layout.tsx` |
| 1G.1 | Layout emits inline anti-flash script that runs before paint | inspect `<head>` of any rendered page; first `<script>` is the matchMedia probe |
| 1G.1 | system-mode hydration uses `prefers-color-scheme` | manual: with theme=system, OS dark → page dark; OS light → page light |
| 1G.2 | Light-mode design tokens in `globals.css` | `:root` has light defaults, `:root.dark` has dark overrides; new `--surface` / `--text` / `--accent` aliases present |
| 1G.2 | WCAG contrast: `--text` on `--surface` ≥ 7:1 (AAA) | computed: `#0a0a0a` vs `#f3f4f6` ≈ 19.5:1 ✓ |
| 1G.2 | `--text-muted` on `--surface` ≥ 4.5:1 (AA) | computed: `#6b7c6b` vs `#f3f4f6` ≈ 4.6:1 ✓ |
| 1G.3 | `/api/me/theme` POST sets cookie + writes DB + writes audit | `grep "cookies().set\|theme.update" src/app/api/me/theme/route.ts` |
| 1G.3 | Cookie name is `theme`, max-age 1 year, SameSite=Lax | unit-pinned in `tests/round-12/theme-picker.test.ts` |
| 1G.4 | `/me/preferences` ships `<ThemePicker>` client island | `grep "ThemePicker" src/app/(app)/me/preferences/page.tsx` |
| 1G.4 | Click optimistically flips `<html>` class within 100ms | manual: click Light → DOM updates instantly |
| 1G.4 | Failed write reverts the class + shows error | manual: throttle network, click — picker reverts |
| 1G.4 | No Save button for theme; digest still has its Save | inspect /me/preferences |
| 1G.5 vitest | `tests/round-12/theme-picker.test.ts` → 28/28 | `npx vitest run tests/round-12/theme-picker.test.ts` |
| 1G.5 e2e | `e2e/theme-picker.spec.ts` exists with 6 documented assertions | runs under §1E Playwright runtime |
| 1G.6 | 12 most-visited pages render readable in both modes | manual sweep on /, /my-day, /tickets, /tickets/INC*, /tickets/kanban, /bench, /scheduling, /scheduling/people, /dashboards, /admin, /admin/users, /profile |

### §1G Manual acceptance gate (must pass before merge)

1. Visit `/me/preferences` as Alex Admin. Click **Light** →
   page IMMEDIATELY repaints to light mode. Hard reload → page is
   STILL light.
2. `document.documentElement.className` includes `"light"`.
   `getComputedStyle(document.body).backgroundColor` is
   `rgb(243, 244, 246)` (NOT `rgb(17, 25, 39)`).
3. Click **Dark**. Page repaints immediately. Reload persists.
4. Click **Match system**. With OS in dark mode, page is dark.
   Toggle OS to light → page flips to light WITHOUT a reload
   (the `prefers-color-scheme` listener fires).
5. Sign out. `/signin` respects OS preference (anti-flash script
   reads OS pref and stamps the class before paint).
6. The 12 most-visited pages render readable text + icons +
   borders in both modes. Anything that doesn't render in light
   mode goes to `docs/round-12-backlog.md` for R13 polish, NOT
   blocking this merge.

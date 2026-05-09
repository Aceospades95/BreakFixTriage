# Round-13 QA checklist

## §1A sidebar broken link /people

| ID | Check | Verify |
|----|-------|--------|
| 1A.1 | /people 308-redirects to /scheduling/people | manual: navigate to /people, observe redirect |
| 1A.2 | Sidebar's "People" entry resolves to a 200 page | sidebar already pointed at /scheduling/people |
| 1A.3 | Routes manifest records the redirect intent | `findRoute("/people")?.redirectsTo === "/scheduling/people"` |
| 1A.4 | docs/round-13-decisions.md documents the choice | file exists |

## §1B CHANGE STATUS (ADMIN) enum suffix dropped

| ID | Check | Verify |
|----|-------|--------|
| 1B.1 | Force-state <option> shows only the humanised label | inspect /tickets/INC* admin panel |
| 1B.2 | Raw enum preserved as `data-state-key` attribute | inspect HTML source |
| 1B.3 | Vitest pin: `tests/round-13/critical-leaks.test.ts` → 11/11 | `npx vitest run tests/round-13/critical-leaks.test.ts` |

## §1C /my-day team queues humanise role

| ID | Check | Verify |
|----|-------|--------|
| 1C.1 | Persona card subtitle uses formatRole(user.role) | `grep "formatRole(user.role)" src/app/(app)/page.tsx` |
| 1C.2 | No raw role enum visible in TEAM QUEUES | manual inspection of /my-day |

## §1D /admin/email-rules tokens as <code>

| ID | Check | Verify |
|----|-------|--------|
| 1D.1 | TokenChip component wraps tokens in <code> with font-mono | `grep -A 1 "function TokenChip" src/app/(app)/admin/email-rules/page.tsx` |
| 1D.2 | RecipientChips renders one TokenChip per recipient | manual inspection of /admin/email-rules |
| 1D.3 | Template column uses TokenChip | manual inspection |
| 1D.4 | Vitest pin verifies all four | tests/round-13/critical-leaks.test.ts |

## §1E + §4C contrast sweep

| ID | Check | Verify |
|----|-------|--------|
| 1E.1 | e2e/contrast-sweep.spec.ts walks 12 pages × 2 themes (24 cases) | `cat e2e/contrast-sweep.spec.ts` |
| 1E.2 | data-theme-resolved is never "pending" at runtime | spec assertion |
| 1E.3 | body fg/bg WCAG luminance ratio ≥ 4.5:1 | spec assertion |
| 1E.4 | sidebar nav contrast ≥ 4.5:1 (catches §1G class) | spec assertion |
| 1E.5 | Spec uses cookie injection — never relies on OS preference | `grep "addCookies" e2e/contrast-sweep.spec.ts` |
| 1E.6 | Tagged @contrast for CI selection | `grep "@contrast" e2e/contrast-sweep.spec.ts` |

## §2A-§2G persona walks

| ID | Check | Verify |
|----|-------|--------|
| 2A | e2e/personas/driver.spec.ts — delivery loop + audit | file exists |
| 2B | e2e/personas/technician.spec.ts — pick-up + transition + admin-panel-hidden | file exists |
| 2C | e2e/personas/dispatcher.spec.ts — bulk + route + permission | file exists |
| 2D | e2e/personas/ops-manager.spec.ts — dashboards + export + admin-blocked | file exists |
| 2E | e2e/personas/warehouse.spec.ts — bench + scan + scheduling-blocked | file exists |
| 2F | e2e/personas/read-only.spec.ts — every read passes + every mutation blocked | file exists |
| 2G | e2e/personas/admin-destructive.spec.ts — reset 2FA + revoke sessions + audit | file exists |
| 2.helper | e2e/lib/sign-in-as.ts uses NextAuth credentials endpoint | file exists; `grep "/api/auth/callback/credentials"` |

## §3 polish

| ID | Status | Verify |
|----|--------|--------|
| 3A quotes pill counts | shipped | inspect /quotes filter row |
| 3B Aging + SLA breached cards link to filtered tickets | shipped | hover the cards on /dashboards + /my-day |
| 3C /invoices uses <EmptyState> | shipped | inspect empty /invoices state |
| 3D /scheduling/people header reflects current date | already-correct | server-rendered subtitle reads the date param |
| 3E admin kebab hit area 44×44 | shipped | inspect /admin overview cards |
| 3F email-rules seed button disables when ≥1 rule | shipped | /admin/email-rules header button |
| 3G /admin/holidays empty-year state shows Seed CTA | shipped | navigate to /admin/holidays?year=2025 |
| 3H Recent sessions "Unknown device" fallback | partial; full parser DEFERRED B8 | docs/round-13-decisions.md |

## §4 hardening

| ID | Check | Verify |
|----|-------|--------|
| 4A.1 | parens-enum grep rule | `bash scripts/check-forbidden-tokens.sh` clean |
| 4A.2 | snake-case-token grep rule | same |
| 4A.3 | sidebar href manifest gate | `assertSidebarHrefsAreKnownRoutes()` |
| 4A.tests | Vitest fixtures (bad fails, clean passes) | `npx vitest run tests/round-13/grep-gate-v5.test.ts` → 6/6 |
| 4B | src/lib/routes-manifest.ts ships | file exists with ROUTES_MANIFEST + SIDEBAR_HREFS |
| 4C | contrast spec runs in CI light + dark | `grep "@contrast" e2e/contrast-sweep.spec.ts` |
| 4D | sign-in-as helper + e2e/README.md | files exist |
| 4E | verify-deploy.sh emits "Round-13 health: OK" | `bash scripts/verify-deploy.sh` against staging |

## Hard gates (final)

- **G1 tsc** — clean
- **G2 forbidden-tokens grep gate v5** — clean (2 new sub-rules)
- **G3 vitest** — 750 active passing / 7 integration skipped / 13 todo. R13 added 54 cases.
- **G4 Playwright** — 7 persona specs + contrast sweep + R12 specs all wired; runtime in CI per §1E
- **G5 prisma migrate deploy** — no schema changes this round
- **G6 verify-deploy** — script emits "Round-13 health: OK" / "FAIL — N failure(s)"
- **G7 7 persona Playwright spec files** — exist
- **G8 read-only role API** — read-only spec walks 5 export endpoints + asserts 401/403
- **G9 audit row coverage** — every persona spec asserts audit-row writes for destructive actions
- **G10 routes manifest** — `assertSidebarHrefsAreKnownRoutes` covers §1A
- **G11 production seed-state** — no change from R12; verify-deploy still asserts
- **G12 R12 regression suite** — `npx vitest run tests/round-12/` still green

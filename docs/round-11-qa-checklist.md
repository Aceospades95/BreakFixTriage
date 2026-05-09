# Round-11 QA checklist

Every R11 acceptance check + how to verify manually. Pair with
`docs/round-11-summary.md` for the high-level "what shipped".

## §HOTFIX-1 /tickets SSR (P0)

| ID | Check | Verify |
|----|-------|--------|
| H1.1 | /tickets returns 200 for every persona | Sign in as each of Alex/Olivia/Dana/Tess/Wes/Dante/Ray; navigate to `/tickets`; assert no error boundary |
| H1.2 | Bulk actions row renders correctly | Olivia → /tickets → row checked → "Bulk actions (1 selected)" appears; both Apply buttons enabled |
| H1.3 | No render-prop antipattern remains | `npx vitest run tests/round-11/hotfix-render-prop-gate.test.ts` → 4/4 |

## §HOTFIX-2 Route smoke gate

| ID | Check | Verify |
|----|-------|--------|
| H2.1 | Sitemap covers every page.tsx | `npx vitest run tests/round-11/route-smoke-coverage.test.ts` → 3/3 |
| H2.2 | e2e/route-smoke.spec.ts lists every concrete route | Same test file pins it |
| H2.3 | Smoke spec asserts no `digest:` / `Something broke` | Test 3 in the same file pins the markers |

## §1A Cmd+K palette URL leak

| ID | Check | Verify |
|----|-------|--------|
| 1A.1 | Palette ticket result has humanised hint | Cmd+K → "INC2200126" → row reads "Open ticket INC2200126" with subtitle "Ticket" — no URL path |
| 1A.2 | Palette school result hint is humanised | Cmd+K → "11X101" → row reads "Find school 11X101" with subtitle "Filter the schools list" |
| 1A.3 | Palette device result hint is humanised | Cmd+K → "SN-1234" → row reads "Find device SN-1234" with subtitle "Search the devices list" |
| 1A.4 | Vitest asserts no slash-prefixed hint or label | `npx vitest run tests/round-11/palette-no-urls.test.ts` → 5/5 |

## §1B Placeholder convention

| ID | Check | Verify |
|----|-------|--------|
| 1B.1 | /duplicates SNOW INC# placeholder reads `e.g. INC1234567` | Visual inspection on /duplicates |
| 1B.2 | All 26 R11-changed placeholders use the `e.g.` prefix | `npx vitest run tests/round-11/placeholder-convention.test.ts` → 10/10 |
| 1B.3 | docs/round-11-placeholder-audit.md documents the convention + every change | File exists + lists all 26 |

## §1C UserSession write path

| ID | Check | Verify |
|----|-------|--------|
| 1C.1 | Schema has ipHash + uaFingerprint + expiresAt | `grep -A 12 "model UserSession" prisma/schema.prisma` |
| 1C.2 | touchSession debounces 1/min + hashes IP/UA with salt | `npx vitest run tests/round-11/sessions-touch.test.ts` → 9/9 |
| 1C.3 | Sign in as Alex → admin views /admin/users/[alex-id] → Recent sessions panel shows ≥1 row with lastSeenAt within last 2 minutes | Manual verification (live DB required) |
| 1C.4 | Sign out all sessions writes audit row `user.sessions.revoke_all` | Manual verification + audit-wave-3 test |
| 1C.5 | NextAuth signOut event revokes the most recent session | Manual: sign out, check that session row has revokedAt set |

## §1D /admin overview kebabs

| ID | Check | Verify |
|----|-------|--------|
| 1D.1 | Every admin card has a kebab (⋯) icon top-right | Visual inspection of /admin |
| 1D.2 | Kebab is keyboard accessible (Tab / Enter / Esc / ↑↓) | Manual keyboard test |
| 1D.3 | Reset to defaults on Statuses card prompts confirm + writes audit | `resetStatusConfigAction` writes `action: "reset"` |
| 1D.4 | Auto-seed federal holidays on Holidays card seeds 11 rows + writes audit | Manual verification (live DB) |
| 1D.5 | CSV exports work for users / schools / devices / email-log | Click each — file downloads |
| 1D.6 | `npx vitest run tests/round-11/admin-kebabs.test.ts` → 10/10 | All 16 cards covered |

## §1E First-run auto-seed

| ID | Check | Verify |
|----|-------|--------|
| 1E.1 | After `prisma migrate deploy && npm run db:seed:defaults`: EmailTemplate ≥8, EmailRule ≥1, Holiday ≥11 | Live DB SQL count |
| 1E.2 | Re-running `npm run db:seed:defaults` does NOT duplicate any row | Run twice — counts identical |
| 1E.3 | seedEmailTemplates is exportable (no top-level main side-effect) | `npx vitest run tests/round-11/seed-defaults.test.ts` → 8/8 |

## §2A Block create end-to-end

| ID | Check | Verify |
|----|-------|--------|
| 2A.1 | Olivia → /scheduling/people → +Add on Tess → fill PTO 9-17 → Save → block visible | e2e/block-create.spec.ts (deferred runtime: §2D) |
| 2A.2 | Audit row staff.schedule.created with Olivia as actor + Tess as target | audit-wave-3 structural |

## §2B Notification dispatch

| ID | Check | Verify |
|----|-------|--------|
| 2B.1 | Ticket creation enqueues SPOC EmailLog within 5s | e2e/notification-dispatch.spec.ts (deferred §2D) |
| 2B.2 | EmailLog.to[] matches rule's recipients spec | Same spec |
| 2B.3 | docs/round-11-email-fixtures.md documents Mailpit + in-memory transport | File exists |

## §2C Read-only role 403 hardening

| ID | Check | Verify |
|----|-------|--------|
| 2C.1 | Ray ReadOnly → POST any mutation endpoint → 403 / redirect | e2e/readonly-role-403.spec.ts (deferred §2D) |
| 2C.2 | docs/permissions.md enumerates the read-only forbidden surface | File exists with complete list |

## §2D CI Postgres + integration

| ID | Check | Verify |
|----|-------|--------|
| 2D.1 | .github/workflows/ci.yml has integration job with Postgres + Mailpit | File modified |
| 2D.2 | npm run test:integration script exists | package.json |
| 2D.3 | tests/integration/ ships 6 specs gated on DATABASE_URL | Folder listed |
| 2D.4 | server-only shim allows lib import in vitest | vitest.config.ts alias |

## §2E Persona suite

| ID | Check | Verify |
|----|-------|--------|
| 2E.1 | 7 persona specs ship in e2e/persona-*.spec.ts | `ls e2e/persona-*.spec.ts` → 7 files |
| 2E.2 | docs/personas.md documents each role's daily workflow | File exists |

## §2F Audit row coverage wave 2

| ID | Check | Verify |
|----|-------|--------|
| 2F.1 | 18 mutation surfaces have writeAudit calls | `npx vitest run tests/round-11/audit-wave-3.test.ts` → 19/19 |
| 2F.2 | R10 §3C 14 surfaces still pinned | Same file's last test |

## §2G Forbidden-tokens grep gate v3

| ID | Check | Verify |
|----|-------|--------|
| 2G.1 | Gate adds url-in-prose for /tickets /bench /dashboards | `bash scripts/check-forbidden-tokens.sh` → clean |
| 2G.2 | Gate adds broad-cuid `c[a-z0-9]{24}` rule | Same |
| 2G.3 | Gate adds `digest:` leak rule | Same |
| 2G.4 | docs/grep-gate-v3.md documents every rule | File exists |
| 2G.5 | `npx vitest run tests/round-11/grep-gate-v3.test.ts` → 6/6 | All rules pinned |

## R10 regression suite (must not regress)

| ID | Check | Verify |
|----|-------|--------|
| R10.* | All 13 R10 leaves still working | `npx vitest run tests/round-11/round-10-regression.test.ts` → 13/13 |

## Hard gates (final report)

- G1 `tsc --noEmit` — clean
- G2 forbidden-tokens grep gate v3 — clean
- G3 vitest — 577 passed / 7 skipped (integration; need DATABASE_URL) / 13 todo
- G4 Playwright route smoke — DEFER until §2D Playwright runtime
- G5 prisma migrate deploy — schema delta in place; verify on first CI Postgres run
- G6 seed idempotency — structural; live verification on first CI Postgres run
- G7 humanise() single entry point — R8 grep gate continues to enforce
- G8 every destructive action writes ≥1 audit row — R10 §3C + R11 §2F (32 surfaces)
- G9 dispatchEmailEvent single chokepoint — R8 grep gate continues to enforce
- G10 every notifyOnEnter status has matching EmailRule — R8 invariant
- G11 first-run auto-seed — `npm run db:seed:defaults` is the production backfill

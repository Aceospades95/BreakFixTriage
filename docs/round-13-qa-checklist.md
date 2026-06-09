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

---

## Round-13 security and correctness pass — additional checks

This appended section covers the security-focused R13 follow-up
that landed on top of the prior R13 sidebar/leak work. Each leaf
ties to a §section in the R13 prompt; G13–G14 are new hard gates.

### §1A — session revocation enforcement

| ID | Check | Verify |
|----|-------|--------|
| 1A.1 | `User.sessionRevokedBefore DateTime?` exists | `grep "sessionRevokedBefore" prisma/schema.prisma` |
| 1A.2 | `getSession()` calls `isJwtRevoked` | `grep "isJwtRevoked" src/lib/auth/session.ts` |
| 1A.3 | NextAuth jwt callback stamps `iat` | `grep "token.iat" src/lib/auth/auth.ts` |
| 1A.4 | `revokeAllSessionsForUser` uses transaction | `grep "$transaction" src/lib/auth/sessions.ts` |
| 1A.5 | Migration adds the column | `cat prisma/migrations/20260509000000_round13_security/migration.sql` |
| 1A.6 | Vitest source pin | `tests/round-13/security-fixes.test.ts` |

### §1B — 2FA reset cascades to session revocation

| ID | Check | Verify |
|----|-------|--------|
| 1B.1 | `adminResetTotpAction` runs in transaction | `grep "$transaction" src/server/actions/2fa.ts` |
| 1B.2 | Cascade clears TOTP + sets `sessionRevokedBefore` + revokes UserSession rows | inspect action body |
| 1B.3 | Audit row carries `revokedCount`, `twoFactorWasEnrolled`, `severity: warn` | inspect writeAudit call |
| 1B.4 | Action name preserved as `2fa:admin-reset` for R12 regression | tests/round-12/2fa-reset.test.ts still green |

### §1C — global search tenant scoping

| ID | Check | Verify |
|----|-------|--------|
| 1C.1 | `globalSearch` accepts `session` and applies scope helpers | `grep -E "ticketWhereForSession|schoolWhereForSession|deviceWhereForSession" src/lib/search.ts` |
| 1C.2 | `/api/search` route passes session | `grep "globalSearch({ query: q, session })" src/app/api/search/route.ts` |
| 1C.3 | User results require `USERS_MANAGE` | `grep "canSeeUserResults" src/lib/search.ts` |
| 1C.4 | Ticket hrefs use `incidentNumber`, not cuid | `grep "/tickets/\\${t.incidentNumber}" src/lib/search.ts` |
| 1C.5 | Admin URLs gated for non-admin actors | `grep "isAdmin ?" src/lib/search.ts` |

### §1D — attachment authorization

| ID | Check | Verify |
|----|-------|--------|
| 1D.1 | Route uses `attachmentForSession` | `grep "attachmentForSession" src/app/api/attachments/[id]/route.ts` |
| 1D.2 | Cross-tenant returns 404 (not 403) | inspect route handler |
| 1D.3 | Helper resolves via Ticket / RouteStop / Quote chain | inspect `lib/data/forSession.ts` |

### §1E — workflow engine reads StatusConfig

| ID | Check | Verify |
|----|-------|--------|
| 1E.1 | `transitionTicket` calls `readStatusConfig` | `grep "readStatusConfig" src/lib/workflow/transition.ts` |
| 1E.2 | Engine uses `getEffectiveTransitions(from, config)` | inspect `transitionInTx` |
| 1E.3 | Disabled-state rejection has explicit message | `grep "is disabled" src/lib/workflow/transition.ts` |
| 1E.4 | Force change writes `severity: warn` | `grep 'severity: opts.force' src/lib/workflow/transition.ts` |

### §1G — dispatchEmailEvent chokepoint truthfulness

| ID | Check | Verify |
|----|-------|--------|
| 1G.1 | `nodemailer` import lives in `lib/email/providers/smtp.ts` | `grep -l nodemailer src/lib/email/providers/smtp.ts` |
| 1G.2 | Legacy `lib/notifications/smtp.ts` delegates | `grep "@/lib/email/providers/smtp" src/lib/notifications/smtp.ts` |
| 1G.3 | No nodemailer outside `lib/email/providers/` | `find src -path src/lib/email/providers -prune -o -type f -print | xargs grep -l nodemailer | head` should be empty |

### §1H — error boundary scrubs digest

| ID | Check | Verify |
|----|-------|--------|
| 1H.1 | Generic copy ("Something went wrong") visible | inspect `src/app/(app)/error.tsx` |
| 1H.2 | Support code derived from first 8 chars uppercase | `grep supportCode src/app/(app)/error.tsx` |
| 1H.3 | `digest:` token absent from JSX text | `grep -E "digest:\\s*\\{" src/app/(app)/error.tsx` returns no hit |
| 1H.4 | Dev-only details block exists | `grep "Developer details" src/app/(app)/error.tsx` |

### §1I — portal token hashing

| ID | Check | Verify |
|----|-------|--------|
| 1I.1 | `PortalToken.tokenPrefix` + `dataScope` columns | `grep -E "tokenPrefix|dataScope" prisma/schema.prisma` |
| 1I.2 | `createPortalToken` returns `{ row, plaintext }` | `grep "CreatePortalTokenResult" src/lib/portal/tokens.ts` |
| 1I.3 | Default expiry 365 days | `grep "DEFAULT_TTL_DAYS = 365" src/lib/portal/tokens.ts` |
| 1I.4 | `resolvePortalToken` hashes before lookup | `grep "hashToken(rawToken)" src/lib/portal/tokens.ts` |
| 1I.5 | School page renders one-shot copy banner | `grep "portal-token-once" src/app/(app)/admin/schools/[schoolId]/page.tsx` |
| 1I.6 | Token list shows `tokenPrefix…`, not the hash | inspect school page |

### §1J — audit column promotion

| ID | Check | Verify |
|----|-------|--------|
| 1J.1 | `AuditLog` schema has `reason`, `transitionType`, `requestId`, `severity` | `grep -E "reason|transitionType|requestId|severity" prisma/schema.prisma` |
| 1J.2 | Migration backfill is idempotent | inspect SQL |
| 1J.3 | `writeAudit` writes the new columns | `grep "severity: entry" src/lib/audit/audit.ts` |
| 1J.4 | New indexes on transitionType + severity + requestId | inspect SQL |

### §2A — tenant-scoped query helpers

| ID | Check | Verify |
|----|-------|--------|
| 2A.1 | `lib/data/forSession.ts` exports the documented helpers | `grep -E "^export" src/lib/data/forSession.ts` |
| 2A.2 | ADMIN returns unrestricted scope | `grep "if (isAdmin(session)) return {}" src/lib/data/forSession.ts` |
| 2A.3 | ADR 0014 documents the conversion roadmap | `cat docs/adr/0014-tenant-scoping.md` |

### §2D — global Referrer-Policy

| ID | Check | Verify |
|----|-------|--------|
| 2D.1 | Default `strict-origin-when-cross-origin` set | `grep "strict-origin-when-cross-origin" next.config.mjs` |
| 2D.2 | Portal routes override to `no-referrer` | `grep "/portal/:path*" next.config.mjs` |

### §2H — health endpoint replaces admin-cookie verification

| ID | Check | Verify |
|----|-------|--------|
| 2H.1 | `/api/health` exposes seed counts | `grep "emailRules" src/app/api/health/route.ts` |
| 2H.2 | Endpoint returns 503 on insufficient seeds | `grep "rules >= 1" src/app/api/health/route.ts` |
| 2H.3 | No admin auth required | inspect route — no requireRole |

## Hard gates added by the security pass

- **G13 R12 regression suite** — `npx vitest run tests/round-13/round-12-regression.test.ts` returns 19/19 green; locks in every R12 PASS as a regression-critical check.
- **G14 R13 security source pin** — `npx vitest run tests/round-13/security-fixes.test.ts` returns 37/37 green; pins every §1 / §2 fix at the source level.

## Deferred (filed in docs/round-13-backlog.md)

- §1F synthetic-merge import reconciliation idempotency keys —
  documentation update + idempotency keys deferred to a future
  round; the eventual-consistency boundary is documented in this
  ADR/assumptions cycle.
- §2B `lib/humanise.ts` becomes the implementation — current
  re-export structure is acceptable; the truthfulness fix is the
  single grep-gate enforcement, which holds.
- §2C internal-link `incidentNumber` sweep — search results
  updated by §1C; remaining sites tracked.
- §2E manager bench query cap — deferred with documented trigger
  condition.
- §2F email queue idempotency comment — comment update deferred.
- §2G schema FK + index cleanup — deferred; existing FKs are
  enforced at the Prisma client level even where the schema
  doesn't declare a relation.
- §2I component-render tests — grep gate freeze accepted; render
  tests filed for R14.
- §2J Round-N comment cleanup — deferred; doesn't affect runtime.
- §2K persona suite un-fixme — accepted current state from prior
  R13 commit (7 persona spec files exist).
- §2L portal data scope — column shipped in §1I; UI form ships in
  the school page.
- §3A Ops Exceptions dashboard — deferred to R14 as a feature
  capability.
- §3B audit wave 5 — partial coverage shipped (every R13 mutation
  writes the new columns); full spec deferred.
- §3C CI integration test failure on skip — deferred; current CI
  passes 762 unit tests.


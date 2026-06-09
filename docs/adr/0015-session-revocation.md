# ADR 0015 — session revocation enforcement

## Status

Accepted. Round-13 §1A + §1B + §1I default expiry policy.

## Context

The R10 schema added a `UserSession` row per active browser plus an
admin "Sign out all sessions" button on `/admin/users/[id]`. The
button updates `revokedAt` on every active row and writes an audit
entry. R11 wired `touchSession` on every authenticated request, so
the panel actually populates.

The R13 independent code review pointed out the gap: revoking a
session does not invalidate the user's outstanding NextAuth JWT.
`getSession()` calls `getServerSession(authOptions)`, which decodes
the JWT and trusts it without consulting `UserSession.revokedAt`.
After revocation, the user's existing tab keeps working until the
12-hour NextAuth `maxAge` expires.

`adminResetTotpAction` had a related gap: clearing TOTP didn't
revoke the user's sessions, so a stolen tablet still authenticated
with the cached JWT even though the user had been required to
re-enroll.

## Decision

Add a coarse-grained revocation cutoff on `User`:

```prisma
model User {
  // ...
  sessionRevokedBefore DateTime?
}
```

`getSession()` reads the JWT's `iat` (issued-at) claim. If it
predates `sessionRevokedBefore`, the session is treated as
unauthenticated — page handlers redirect to `/signin`, API handlers
return 401 with `{ code: 'SESSION_REVOKED' }`.

`revokeAllSessionsForUser(userId)` runs in a single transaction:

1. `UPDATE UserSession SET revokedAt = now() WHERE userId = $1 AND revokedAt IS NULL`
2. `UPDATE User SET sessionRevokedBefore = now() WHERE id = $1`
3. (Caller writes the audit row with `revokedCount`,
   `sessionRevokedBefore`, and `severity: warn`.)

`adminResetTotpAction` cascades: clearing `totpSecret`,
`totpEnabledAt`, and `backupCodes` happens in the same transaction
that bumps `sessionRevokedBefore` and revokes every active
`UserSession`. The audit row records `revokedCount`,
`twoFactorWasEnrolled`, and `sessionRevokedBefore` so compliance can
reconstruct the event.

## Alternatives considered

1. **Per-session `jti` (JWT ID).** Issue a fresh `jti` on sign-in,
   store it on `UserSession`, and reject JWTs whose `jti` doesn't
   match an active row. Stronger granularity (revoke only one
   browser, leave the others alive). Deferred to backlog as B-13;
   needed once we add a "Sign out THIS device" affordance per row.
   Coarse `sessionRevokedBefore` matches the current "Sign out ALL
   sessions" UI and the 2FA-reset cascade.

2. **Database-backed sessions.** Switch NextAuth from JWT to
   database session strategy. Strongest guarantee but adds a DB
   round-trip per page load. The reviewer didn't flag latency as a
   concern, but the migration cost is non-trivial and the JWT
   strategy is well-understood.

3. **Short JWT maxAge with refresh.** Drop `maxAge` from 12h to ~5
   minutes and refresh server-side. Mitigates the leak window but
   doesn't close it; revocation still has a window during which
   the cached JWT works. Rejected on its own; complementary to the
   chosen design.

## Consequences

- An admin "Sign out all sessions" or 2FA reset takes effect on
  the next request from any of the user's tabs. Acceptable
  latency (single request, not a polling window).
- `getSession()` adds one DB read per authenticated request when
  `sessionRevokedBefore` is set (none otherwise — the column is
  null for the vast majority of users). The check is a primary-key
  read on User; cost is negligible.
- The revocation event is captured in two places: `UserSession`
  rows (per-row `revokedAt`) for the panel display, and User
  (`sessionRevokedBefore`) for the JWT gate. Both are updated in a
  single transaction so the gate can never lag the per-row state.
- The integration test `tests/integration/session-revocation.spec.ts`
  is the executable model: revoke → next request rejected → after
  re-auth, new JWT works.
- ADR 0006 (audit row includes reason) gets a new related row:
  `severity: 'warn'` on revocation events makes them filterable on
  `/admin/audit` once §1J wave-5 ships.

## R14+ entrypoints

- Per-session `jti` for fine-grained revocation.
- Anomalous-session detection (the §3A Ops Exceptions dashboard
  surface).
- Session-bind to IP fingerprint (out of scope for R13 because
  IP rotation under NAT is the norm for school networks).

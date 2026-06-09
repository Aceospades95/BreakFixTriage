# Round-14 assumptions

1. **Playwright pinned to 1.56.0.** The execution environment ships
   pre-baked Chromium build 1194 and blocks new browser downloads.
   `@playwright/test` floated (`^1.48.0`) to 1.59.x, which requires
   build 1217 → every e2e run failed at browser launch. 1.56.0 is
   the exact version matching build 1194. CI environments that can
   download browsers are unaffected by the pin; environments that
   can't are now reproducible.

2. **`requireRole` redirect over thrown error (ADR 0017).** We
   assume no future code wants to *catch* an authorization failure
   from `requireRole` — grep confirmed zero existing catchers. Code
   that needs a non-redirecting check should use `canAsync` or the
   sync `requirePermission` (which still throws).

3. **Streaming redirect is acceptable UX.** Because of the (app)
   loading.tsx boundary, permission redirects arrive as in-body
   client navigations (HTTP 200 + navigation) rather than 307s.
   Real browsers land on /forbidden either way; only raw HTTP
   clients see the 200. API routes keep real status codes.

4. **Admin segment admits EMAIL_WRITE.** The /admin layout now
   admits `USERS_MANAGE` OR `EMAIL_WRITE` sessions. We assume the
   email-admin pages are the only OPS_MANAGER-reachable admin
   surfaces; each admin page keeps its own precise gate, so a new
   page added under /admin without a gate would be reachable by
   ops managers — the per-page `requireRole` audit in the R14
   review confirmed all 27 existing pages carry one.

5. **Pick-up is a transition-tier capability.** `pickUpTicketAction`
   moved from TICKETS_WRITE to TICKETS_TRANSITION on the strength
   of the Round-10 §2F brief ("so a tech can claim work in one
   click"). Self-assignment of unassigned tickets by warehouse /
   dispatcher roles is treated as intended, not an escalation; the
   unassigned-only invariant (cannot steal assigned work) is
   unchanged.

6. **B15 closed without a CSS change.** The R13 contrast finding on
   /my-day light mode could not be reproduced once the spec stopped
   racing the /my-day → / redirect; all 24 page×theme combinations
   measure ≥ 4.5:1. We assume the original finding was the race,
   not a since-fixed style.

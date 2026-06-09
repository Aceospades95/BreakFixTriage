# ADR 0017 — `requireRole` redirects to a chromed `/forbidden` page

- **Status:** accepted (Round-14)
- **Graduates:** backlog B8 (Round-11 §2C / Round-13 §2F)

## Context

`requireRole` threw `AuthorizationError`, caught by the `(app)`
error boundary. The boundary tried to detect authorization errors
via `/AuthorizationError/.test(error.message)` — but Next.js scrubs
server-component error messages in production, so the regex never
matched outside dev. Every production permission denial rendered as
a generic "Something went wrong" with a support code: operators
could not tell a crash from a permission gap, and the page returned
HTTP 200.

Two concrete bugs compounded this:

1. `/invoices` gated on `TICKETS_WRITE` for a read surface, locking
   out the READ_ONLY role entirely (docs/sitemap.md documents
   READ_ONLY + QUOTES_READ).
2. The `/admin` layout gated everything on `USERS_MANAGE`, locking
   OPS_MANAGER out of `/admin/email-log` + `/admin/email-templates`
   despite the role holding `EMAIL_WRITE` (the documented grant).

## Decision

1. `requireRole` now calls `redirect("/forbidden?perm=<permission>")`
   on failure instead of throwing. Nothing in the codebase caught
   `AuthorizationError` (verified by grep), so no behavior is
   silently lost. `redirect()` works in both server components and
   server actions.
2. New chromed page at `src/app/(app)/forbidden/page.tsx`: shows the
   signed-in identity, humanised role, and the missing permission in
   a `<code>` chip, with links home. Registered in the routes
   manifest and docs/sitemap.md.
3. The `/admin` layout admits any session holding `USERS_MANAGE` OR
   `EMAIL_WRITE`; every admin page keeps its own precise gate, and
   the admin sidebar renders only the links the role can open.
4. Route handlers (CSV exports etc.) keep returning real 401/403
   status codes — a redirect would corrupt a file download.

## Consequences

- Because the `(app)` segment has a `loading.tsx` Suspense boundary,
  the response streams; a redirect thrown by the page is delivered
  as an in-body client navigation with HTTP 200 rather than a 307.
  Browsers land on /forbidden either way. e2e specs that assert
  blocking must wait for the URL (`expectBlocked` in e2e/lib/access.ts
  does this).
- `AuthorizationError` + the sync `requirePermission` helper remain
  for library-level checks; the error boundary keeps its
  "Access denied" copy as a fallback for any residual throw site.
- The e2e spec `e2e/readonly-role-403.spec.ts` is fully active:
  5 export endpoints assert 401/403, 13 permission-gated pages
  assert the /forbidden redirect.

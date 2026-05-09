# Round-11 postmortem — /tickets SSR error (digest 3087090167)

## Severity

P0. /tickets is the central operations page. With it down, no
operator can triage their queue. /tickets/kanban and /tickets/[id]
worked, but the index — the entry point — threw the global error
boundary.

## Timeline

| When | Event |
|------|-------|
| Round-10 §1E | Bulk actions disabled-when-empty + count surfacing landed via a new `<BulkSelectionWatcher>` component using a render-prop child. Local dev + tests passed; the component file itself had `"use client"`. |
| R10 hardening pass | Forbidden-tokens grep + vitest 490/490. Neither caught the SSR error because both gates inspect static source, not the React Server Components serialization contract. |
| R10 ship | Branch merged to main, deployed to triage.omnia-house.com. |
| R11 recon | First operator hit the `/tickets` index. SSR error rendered the global error boundary with `digest=3087090167`. /tickets/kanban + /tickets/[id] continued to work. |

## Root cause

`src/components/bulk-selection-watcher.tsx` declared:

```tsx
export function BulkSelectionWatcher({
  formId,
  inputName,
  children,
}: {
  formId: string;
  inputName: string;
  children: (count: number) => React.ReactNode;  // ← FUNCTION CHILD
}) { ... }
```

`/tickets/page.tsx` was a server component (no `"use client"`).
It rendered:

```tsx
<BulkSelectionWatcher formId="..." inputName="...">
  {(count) => (
    <div>Bulk actions{count > 0 ? ` (${count})` : ""}...</div>
  )}
</BulkSelectionWatcher>
```

In React Server Components, children passed across the
server→client boundary are **serialized into the React Server
Component payload**. Functions are not serializable. The render
prop `(count) => <div />` could not be encoded; Next.js threw
during the server render.

The error did not surface in development before deploy because
the dev server's HMR pipeline tolerates the same case differently
than the production server-render.

## Fix (R11 §HOTFIX-1)

`src/components/bulk-selection-watcher.tsx` was deleted. A new
`src/components/tickets-bulk-actions.tsx` is a single
`"use client"` component that:

1. Renders the entire form + bulk-actions row UI inline
2. Owns the selection counter via `useState`
3. Receives the table to render as `children: React.ReactNode`
   (plain JSX — serializable)
4. Receives server actions and option lists as props (serializable)

The server component `/tickets/page.tsx` now passes the rendered
table as JSX children:

```tsx
<TicketsBulkActions ...>
  <TicketTable ... />
</TicketsBulkActions>
```

No function crosses the boundary.

## What gate would have caught this?

None of the existing gates would have. The render-prop pattern is
syntactically valid TypeScript, passes tsc, and the call site
compiles. The bug only surfaces when the server attempts to
serialize the component tree.

R11 added two gates:

1. **`tests/round-11/hotfix-render-prop-gate.test.ts`** — walks
   every `"use client"` file and rejects any `children: (...) =>`
   parameter signature. This catches the antipattern at the type
   level: a client component MUST NOT advertise function-children
   because the server will fail to serialize.

2. **`e2e/route-smoke.spec.ts`** + structural sitemap-coverage
   gate — signs in as the lowest-privilege role for every
   documented route and asserts the global error-boundary markers
   (`Something broke on this page`, `digest:`, `Application
   error: a server-side exception has occurred`) do NOT appear.
   Backed by `tests/round-11/route-smoke-coverage.test.ts` which
   enforces every `page.tsx` is documented in `docs/sitemap.md`
   and exercised by the smoke spec.

The grep gate v3 (§2G) added a `digest:` literal in user-visible
JSX rule for paranoia — if an error string ever bleeds into copy
again, the gate fails offline.

## Why didn't pre-deploy catch it?

R10's deploy pipeline ran:

- `tsc --noEmit` (passed — no type error)
- `vitest run` (passed — 490/490)
- `bash scripts/check-forbidden-tokens.sh` (passed — clean)

None of the three exercises the React Server Components
serialization contract. The Playwright route smoke gate was the
gap; R11 §HOTFIX-2 fills it. Until §2D CI Postgres + Playwright
provisioning ships, the structural coverage test is the
substitute — it asserts the spec exists and covers every page,
even if Playwright itself isn't running yet.

## Lessons

- Render-prop children across server→client boundaries are an
  invariant violation, not a styling preference. Forbid them via
  static lint.
- Every page.tsx needs a smoke test that asserts the page renders
  without the error boundary. Type-checking and unit tests don't
  exercise the serialization step.
- When a structural class of bug is found in one place, sweep the
  entire class. The R11 gate caught one offender (the deleted
  watcher); future similar refactors get blocked at PR time.

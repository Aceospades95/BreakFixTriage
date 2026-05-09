# ADR 0009 — `/admin/audit` cards over tables; default Last-7-days

**Status:** Accepted (shipped in Round-3).

**Date:** 2026-05-06.

## Context

The Round-2 `/admin/audit` page rendered every audit row as a 6-column
table cell. Three problems showed up in field use:

1. The "Before → After" cell wrapped over four lines for any non-trivial
   diff, breaking the table's visual rhythm and pushing the actor /
   entity columns out of alignment.
2. The default page loaded the most recent 100 rows with no
   time-window filter; on a busy day that was three months of audit
   churn rendered up front.
3. Filter chips for "show me only ticket transitions" / "show me only
   email events" required typing `entityType=Ticket` into a free-form
   search field. Operators didn't.

## Decision

The page becomes a card list with a default Last-7-days range filter
and multi-select category chips above the list.

### Layout

- **Range chips** (Last 7 / 30 / 90 days, All time). Default 7d.
- **Category chips** (Ticket / Route / Settings / Email / Status / User).
  Multi-select; OR-of-categories. Each chip maps to one or more
  `AuditLog.entityType` values declared in the page's
  `CATEGORY_CHIPS` table.
- **Actor / entityId text inputs** below the chips for the long-tail
  filter cases.
- **Cards** instead of rows. Each card shows: timestamp,
  colour-coded action chip (via `formatAuditAction`), entity link,
  ID chip, actor (right-aligned). Reason is a labelled line below
  the header. Field diff is collapsed inside `<details>` — operators
  expand only when they need it.

### Page size

Drops from 100 → 25. Reviewers paginate; load times stay snappy.

### URL state

Range, cats, actor, entityId, page all persist in the URL. Bookmarkable
filtered views are how reviewers share findings without re-typing.

## Consequences

- The `EntityDiff` component from Round-2 gets re-used here unchanged
  (it lives inside the `<details>` block).
- The `formatAuditAction` chip helper from Round-2 stays the canonical
  formatter; the audit page's chip colour mapping is the only
  audit-page-specific render code.
- The Round-2 export-CSV link continues to work; its query param shape
  was renamed from `entityType` (single) to `entityTypes` (comma-joined)
  to match the multi-select chips.

## Defers

- Click-to-copy on the IdChip needs a client component (Round-3 §F27);
  shipped today as a hover-title fallback. Tracked in §QA.
- Default filter persistence per-user (so an admin's last-used range
  comes back on next visit) is a UserPreference field; filed.
- Saved filter views ("All ticket transitions in the last 30 days
  by Tess Technician") would be a power-user feature; not requested.

## Alternatives considered

- **Keep the table, add chip filters above.** Rejected — the
  4-line-wrap problem on the diff cell is the primary visual
  failure; the table layout amplifies it. Cards bound the
  diff inside a `<details>` so the page rhythm holds.
- **Virtualised infinite scroll.** Rejected for a first cut —
  pagination is well understood and the page's density is the
  fix, not the loading model.

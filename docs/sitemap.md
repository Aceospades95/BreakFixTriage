# Sitemap

Every documented route + the lowest-privilege role that can reach
it without a 403. Used by §HOTFIX-2 route smoke gate and §2E
persona-walked Playwright suite.

Roles are sorted least → most privileged: `READ_ONLY` < `DRIVER` <
`WAREHOUSE` ≈ `TECHNICIAN` < `DISPATCHER` < `OPS_MANAGER` <
`ADMIN`. The "lowest role" column is the role with the smallest
permission set still allowed in.

## Public

| Path | Lowest role | Notes |
|------|-------------|-------|
| `/signin` | unauthenticated | NextAuth sign-in form |
| `/portal/[token]` | unauthenticated | Quote-approval portal — token-gated |

## Authenticated, no role check

These pages live behind sign-in but do not require a permission.
Every signed-in user reaches them.

| Path | Lowest role | Notes |
|------|-------------|-------|
| `/` | any | My-day landing page |
| `/audit` | any | User's own audit feed (filtered to actor) |
| `/me/preferences` | any | Personal digest hour + tz |
| `/me/schedule` | any | Personal block view |
| `/my-day` | any | Today's queue |
| `/notifications` | any | Personal in-app feed |
| `/profile` | any | Profile + name |
| `/profile/2fa` | any | Personal 2FA setup |
| `/[...notfound]` | any | 404 fallback with sitemap |
| `/admin/[...notfound]` | any | 404 fallback inside admin |

## Tickets

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/tickets` | READ_ONLY | TICKETS_READ |
| `/tickets/kanban` | READ_ONLY | TICKETS_READ |
| `/tickets/[ticketId]` | READ_ONLY | TICKETS_READ |
| `/tickets/[ticketId]/print` | READ_ONLY | TICKETS_READ |
| `/bench` | READ_ONLY | TICKETS_READ |
| `/duplicates` | READ_ONLY | TICKETS_READ (resolve gate inside) |
| `/scan` | READ_ONLY | TICKETS_READ |
| `/scan/warehouse` | TECHNICIAN | TICKETS_TRANSITION |

## Scheduling

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/scheduling` | READ_ONLY | SCHEDULING_READ |
| `/scheduling/calendar` | READ_ONLY | SCHEDULING_READ |
| `/scheduling/people` | READ_ONLY | SCHEDULING_READ |
| `/scheduling/routes` | any | view-only |
| `/scheduling/routes/[routeId]` | READ_ONLY | SCHEDULING_READ |
| `/scheduling/routes/[routeId]/print` | READ_ONLY | SCHEDULING_READ |
| `/scheduling/routes/new` | DISPATCHER | ROUTES_BUILD |

## Imports + Quotes + Invoices

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/imports` | READ_ONLY | IMPORTS_READ |
| `/imports/[batchId]` | READ_ONLY | IMPORTS_READ |
| `/imports/new` | OPS_MANAGER | IMPORTS_RUN |
| `/quotes` | READ_ONLY | QUOTES_READ |
| `/invoices` | READ_ONLY | QUOTES_READ |

## Dashboards

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/dashboards` | READ_ONLY | REPORTS_READ |
| `/dashboards/devices` | READ_ONLY | REPORTS_READ |
| `/dashboards/finance` | READ_ONLY | REPORTS_READ |
| `/dashboards/productivity` | READ_ONLY | REPORTS_READ |

## Admin overview + users + districts

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/admin` | ADMIN | USERS_MANAGE |
| `/admin/audit` | ADMIN | USERS_MANAGE |
| `/admin/holidays` | ADMIN | USERS_MANAGE |
| `/admin/permissions` | ADMIN | USERS_MANAGE |
| `/admin/settings` | ADMIN | USERS_MANAGE |
| `/admin/statuses` | ADMIN | USERS_MANAGE |
| `/admin/tools/bulk-close` | ADMIN | USERS_MANAGE |
| `/admin/users` | ADMIN | USERS_MANAGE |
| `/admin/users/new` | ADMIN | USERS_MANAGE |
| `/admin/users/[userId]` | ADMIN | USERS_MANAGE |

## Admin device + school + parts catalogue

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/admin/device-models` | ADMIN | DISTRICTS_MANAGE |
| `/admin/device-models/[modelId]` | ADMIN | DISTRICTS_MANAGE |
| `/admin/devices` | ADMIN | DISTRICTS_MANAGE |
| `/admin/devices/new` | ADMIN | DISTRICTS_MANAGE |
| `/admin/devices/[deviceId]` | ADMIN | DISTRICTS_MANAGE |
| `/admin/districts` | ADMIN | DISTRICTS_MANAGE |
| `/admin/parts` | ADMIN | DISTRICTS_MANAGE |
| `/admin/parts/new` | ADMIN | DISTRICTS_MANAGE |
| `/admin/parts/[partId]` | ADMIN | DISTRICTS_MANAGE |
| `/admin/schools` | ADMIN | DISTRICTS_MANAGE |
| `/admin/schools/new` | ADMIN | DISTRICTS_MANAGE |
| `/admin/schools/[schoolId]` | ADMIN | DISTRICTS_MANAGE |
| `/admin/templates` | ADMIN | DISTRICTS_MANAGE |

## Admin email

| Path | Lowest role | Permission |
|------|-------------|------------|
| `/admin/email-log` | OPS_MANAGER | EMAIL_WRITE |
| `/admin/email-templates` | OPS_MANAGER | EMAIL_WRITE |
| `/admin/email-templates/[id]` | OPS_MANAGER | EMAIL_WRITE |
| `/admin/email-rules` | ADMIN | EMAIL_RULES_MANAGE |

## Permission matrix summary

A role-walk that visits every page above and asserts 200 vs 403:

- **READ_ONLY (Ray)** — every `READ_ONLY` row + every "any" row
- **DRIVER (Dante)** — `READ_ONLY` rows minus IMPORTS / REPORTS / EMAIL,
  plus STOPS_UPDATE and SCHEDULING_READ
- **TECHNICIAN (Tess)** — `READ_ONLY` set + `/scan/warehouse`
- **WAREHOUSE (Wes)** — same as TECHNICIAN for read surface
- **DISPATCHER (Dana)** — adds `/scheduling/routes/new`
- **OPS_MANAGER (Olivia)** — adds `/imports/new`, `/admin/email-log`,
  `/admin/email-templates`
- **ADMIN (Alex)** — every page

Pages flagged `any` are reachable from every authenticated session
regardless of role. They typically scope content to the actor.

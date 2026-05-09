# Personas — daily workflows

One section per role. Each section describes the role's typical
day, the pages they routinely visit, and the pages they should be
blocked from. Used by `e2e/persona-*.spec.ts` and the Round-11
qa-checklist persona walks.

The seeded fixture in `prisma/seed.ts` ships one persona per role
(see /admin/users for the test credentials):

| Persona | Email | Role |
|---------|-------|------|
| Alex Admin | `alex@example.test` | ADMIN |
| Olivia Ops | `olivia@example.test` | OPS_MANAGER |
| Dana Dispatcher | `dana@example.test` | DISPATCHER |
| Tess Technician | `tess@example.test` | TECHNICIAN |
| Wes Warehouse | `wes@example.test` | WAREHOUSE |
| Dante Driver | `dante@example.test` | DRIVER |
| Ray ReadOnly | `ray@example.test` | READ_ONLY |

All seeded with password `test-password`.

## Alex Admin (ADMIN)

**Day**: arrive, review /admin overview cards for low counts;
respond to any "needs address" or "permissions overridden" flags;
walk /admin/audit for last 24h destructive actions; spot-check
/admin/email-rules for any disabled rule that should fire.

**Allowed**: every page.

**Persona spec covers**: /admin overview kebab actions (§1D),
/admin/holidays auto-seed CTA, /admin/users session revoke
(§1C), /admin/audit filter chips, /admin/email-rules toggle.

## Olivia Ops (OPS_MANAGER)

**Day**: triage /tickets queue, transition stuck tickets, run
/imports/new on the morning's ServiceNow batch, build/edit a
route on /scheduling/routes, send a quote on /quotes.

**Allowed**: tickets/* (read+write+transition), imports/* (read+
run), scheduling/* (read+write+route build), quotes/* (read+
write), dashboards/*, /admin/email-log, /admin/email-templates.

**Forbidden**: /admin (USERS_MANAGE), /admin/permissions,
/admin/email-rules, /admin/districts/*, /admin/devices/*,
/admin/parts/*, /admin/holidays, /admin/settings, /admin/audit.

**Persona spec covers**: ticket transition flow, route build,
quote send, the §2A block create on a tech's row.

## Dana Dispatcher (DISPATCHER)

**Day**: assign tickets to techs, sequence stops on
/scheduling/routes, review /scheduling/people for absences.

**Allowed**: tickets read+transition, scheduling read+write,
routes:build, stops:update, dashboards.

**Forbidden**: tickets:write (cannot create new tickets), every
admin page, imports/new.

**Persona spec covers**: bulk transition, route reorder,
read-only assertion on the tickets quick-create form.

## Tess Technician (TECHNICIAN)

**Day**: pick up assigned tickets, scan devices on /scan, log
time, transition ticket states.

**Allowed**: tickets read+transition, scheduling read, scan,
scan/warehouse, dashboards, my-day.

**Forbidden**: tickets:write, every admin page, imports/new,
scheduling write, route build.

**Persona spec covers**: scan-and-resolve flow, time logging,
ticket pick up (§2F R10), my-day queue ordering.

## Wes Warehouse (WAREHOUSE)

**Day**: receive parts, mark stops complete, scan devices coming
out of repair.

**Allowed**: tickets read+transition, scheduling read,
scan/warehouse, my-day.

**Forbidden**: tickets:write, every admin page, scheduling write,
route build.

**Persona spec covers**: warehouse scan flow, my-day queue.

## Dante Driver (DRIVER)

**Day**: drive the day's route, mark stops complete, log device
movements.

**Allowed**: tickets:read, scheduling:read, stops:update.

**Forbidden**: tickets:transition, every admin page, every write
on tickets / scheduling / quotes / imports.

**Persona spec covers**: stop completion, device movement log,
read-only assertion on the ticket detail page actions.

## Ray ReadOnly (READ_ONLY)

**Day**: pull dashboard data, look at recent tickets and recent
imports, check the email log status of a specific send.

**Allowed**: tickets:read, imports:read, scheduling:read,
quotes:read, reports:read, email:read (per-ticket-only).

**Forbidden**: every mutation. The §2C spec walks the entire
write surface and asserts 403.

**Persona spec covers**: dashboard read paths, the §2C 403 walk.

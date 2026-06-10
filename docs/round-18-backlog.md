# Round-18 backlog

Filed during R18 — to ship in a later round.

## Carried forward (unchanged)

- **E1** — dashboards tenant scoping (R16). Still the biggest
  standing item; needs `BreakFixSession` threaded through
  `lib/reports/*`.
- **B13** — audit string normalisation (sweep + historical
  migration).
- **E2/E3** — exceptions badge over SSE; bulk requeue-all.
- **Worker/cron wiring** — `email:worker`, `escalate:stale`,
  `digest`, `quotes:sweep` still rely on the operator adding cron
  entries on the host (documented in the deploy runbook). Folding
  a worker sidecar into docker-compose + the Unraid template would
  remove the manual step.

## New in R18

- **F1 — persisted stop check-offs.** The StopCompletion
  checklist is a client-side procedural gate; the durable record
  is the completion audit + attachments. If ops ever needs
  per-device check-off *history* (who ticked what, when), add a
  StopDeviceCheck table and submit ticks per line.
- **F2 — required-proof enforcement.** The stop card *states*
  "photo + signature before completing" but the server doesn't
  reject a completion without attachments. Decide policy (hard
  block vs warn) with ops, then enforce in
  `updateStopStatusAction`.
- **F3 — offline tolerance for drivers.** The route page is
  server-rendered; a dead zone mid-route means no status clicks.
  Out of scope for now (needs a service-worker + mutation queue).
- **F4 — driving directions.** Leaflet draws straight dashed legs
  between stops. Real turn-by-turn polylines would need a routing
  service (OSRM is self-hostable, fits the deployment shape).
- **F5 — per-contact pick on stop cards.** The stop card shows
  the school's main/primary contact; schools with several contacts
  may want a per-stop override.

## Business clarifications wanted

- When a quote gets **no response**, how long before ops returns
  the device (QUOTE_NO_RESPONSE → PENDING_DELIVERY)? The sweep
  nags but nothing auto-transitions — intentional?
- Should completing a **delivery** stop close the ticket
  immediately, or wait for INVOICE_REQUIRED in billable cases?
  Today the cascade closes non-billable paths directly.
- Is a **signature** mandatory at every stop, or only deliveries?
  (Drives F2.)

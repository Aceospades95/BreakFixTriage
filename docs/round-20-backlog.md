# Round-20 backlog

Filed during R20 — to ship in a later round.

## Carried forward (unchanged)

- **E1** — dashboards tenant scoping (R16).
- **B13** — audit string normalisation.
- **E2/E3** — exceptions badge over SSE; bulk requeue-all.
- **F2–F5 (R18)** — required-proof enforcement at completion,
  offline tolerance for drivers, OSRM driving directions, per-stop
  contact override. (F1 — persisted check-offs — SHIPPED this round
  as StopDevice.confirmedAt/By.)
- **Worker/cron wiring into docker-compose/Unraid template** — the
  runbook now documents all seven cron lines (worker, escalate,
  digest, quote sweep, 3× reports), but they still live on the
  host. A sidecar container would remove the manual step.

## New in R20

- **G1 — expense reimbursement state.** SUBMITTED → APPROVED /
  REJECTED ships; a REIMBURSED terminal state + batch "mark week
  reimbursed" would close the loop with payroll.
- **G2 — report recipients UI.** Recipients live on the
  report_operations/report_finance email rules, which works but
  buries a business setting in admin plumbing. A small "Reports"
  settings card (frequency toggles + recipient lists) would be
  friendlier.
- **G3 — delay cascades.** A delay on stop N pushes only stop N's
  estimate; later stops on the same route plausibly slip too.
  Auto-cascade (with per-stop override) needs ops input on the
  right default.
- **G4 — team-note audiences.** Notes currently banner for
  everyone. Per-role or per-district targeting ("drivers only")
  is an obvious refinement once volume grows.
- **G5 — customer-facing report email.** report_operations is
  internal-toned; a per-district customer digest (their tickets
  only, friendlier copy) needs tenant-scoped report builders —
  pairs with E1.
- **G6 — PO numbering policy.** PO-<year>-<seq> with a count-based
  sequence is fine at this volume; a dedicated sequence table would
  be more robust under heavy concurrent use.

## Business clarifications wanted

- Should a reported delay notify the SPOCs of LATER stops on the
  same route too (G3)?
- Expense policy: receipt photo mandatory before approval, or
  reviewer's discretion (today: discretion)?
- Who is the customer audience for the operations report — district
  leadership, school SPOCs, or both (G5)?

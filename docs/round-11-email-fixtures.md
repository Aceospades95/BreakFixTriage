# Round-11 §2B — email fixture setup

## Goal

The notification dispatch e2e spec
(`e2e/notification-dispatch.spec.ts`) needs to assert that an
EmailLog row appears with `status="dispatched"` after a ticket is
created. The send must NOT hit a real provider — we don't want
test runs to spam SPOC contacts at customer schools.

## Fixture: Mailpit

[Mailpit](https://mailpit.axllent.org/) is a self-contained SMTP
sink with a JSON API. It accepts SMTP traffic on `:1025`, exposes
a JSON API on `:8025`, and discards everything that comes in.

### Local dev

```bash
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit:latest
```

`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`. The `dispatchEmailEvent`
chokepoint already reads these from process.env. With Mailpit
running, every send queues into the sink and is visible at
`http://127.0.0.1:8025`.

### CI

`docker-compose.ci.yml` (added under §2D) declares the Mailpit
service alongside Postgres:

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: breakfix_ci
      POSTGRES_USER: bf
      POSTGRES_PASSWORD: bf
    ports: ["5432:5432"]
  mailpit:
    image: axllent/mailpit:latest
    ports: ["1025:1025", "8025:8025"]
```

CI exposes `SMTP_HOST=mailpit`, `SMTP_PORT=1025` to the test
runner. The Playwright spec probes
`http://mailpit:8025/api/v1/messages` to assert the message landed.

## Alternative: in-memory transport

For unit tests that don't need a real SMTP socket, set
`EMAIL_TRANSPORT=memory`. The transport implementation in
`src/lib/email/send.ts` should branch on this env var and:

- Append every send to a global `__memorySink` array
- Return `{ messageId: "memory-${randomBytes(8).hex}" }`
- Be reset between tests via a `resetMemorySink()` export

This is the path used by the integration tests under
`tests/integration/email-dispatch.test.ts` (added in §2D).

## Wiring summary

| Layer | Transport | Why |
|-------|-----------|-----|
| Local dev | Mailpit (SMTP) | Visual inspection in browser |
| Vitest unit | in-memory | Fast, no socket overhead |
| Vitest integration | Mailpit (SMTP) | Real provider semantics |
| Playwright e2e | Mailpit (SMTP) | Asserts the full chokepoint path |

## Assertion contract

The §2B spec asserts:

1. EmailLog row exists with `ticketId` matching the new ticket
2. `templateId` matches the seeded `ticket_created` template
3. `to[]` includes the school's SPOC contact email
4. `status` is one of `dispatched` or `queued`
5. Mailpit JSON API shows a message with the rendered subject

Failure of any of (1)-(4) means the dispatch chokepoint or
EmailRule recipient resolver regressed. Failure of (5) means the
SMTP transport itself broke.

## DEFERRED until §2D ships

- Wiring the actual `docker-compose.ci.yml` into the GitHub
  Actions workflow.
- Provisioning Mailpit on the dev hosts (currently developers run
  the Docker command above by hand).
- Adding the in-memory transport branch to
  `src/lib/email/send.ts` — the current implementation always
  goes through nodemailer.

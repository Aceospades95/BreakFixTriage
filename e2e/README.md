# Playwright e2e suite

Specs in this folder run under the §1E Playwright runner against
a built Next.js app + Postgres provisioned by CI.

## Layout

- `e2e/route-smoke.spec.ts` — every documented sitemap entry
  returns 200 + no error boundary + no chromed-not-found
- `e2e/persona-*.spec.ts` — R11 stubs (low-fidelity walks)
- `e2e/personas/*.spec.ts` — R13 deep workflow walks (one per
  role)
- `e2e/2fa-reset.spec.ts` — R12 §1D Reset 2FA admin flow
- `e2e/theme-picker.spec.ts` — R12 §1G theme read path live walk
- `e2e/not-found-chrome.spec.ts` — R12 §2J chromed-404 regression
- `e2e/lib/sign-in-as.ts` — credential-injection helper (R13 §4D)

## Sign-in helper

Every persona spec authenticates via the helper at
`e2e/lib/sign-in-as.ts`. The helper hits the NextAuth
credentials endpoint directly with the seeded persona's email +
the well-known test password — never via the visual sign-in
form.

Why not the form?
- Faster: one HTTP request vs. visit + fill + submit
- Less flaky: no risk of typing into a stray focused element
- Doesn't bake the test password into spec source

```ts
import { signInAs, PERSONA } from "./lib/sign-in-as";
await signInAs(page, PERSONA.DRIVER);
await page.goto("/scheduling/routes");
```

## Persona credentials

Seeded by `prisma/seed-test.ts`:

| Constant | Email | Role |
|----------|-------|------|
| `PERSONA.ADMIN` | alex@example.test | ADMIN |
| `PERSONA.OPS_MANAGER` | olivia@example.test | OPS_MANAGER |
| `PERSONA.DISPATCHER` | dana@example.test | DISPATCHER |
| `PERSONA.TECHNICIAN` | tess@example.test | TECHNICIAN |
| `PERSONA.WAREHOUSE` | wes@example.test | WAREHOUSE |
| `PERSONA.DRIVER` | dante@example.test | DRIVER |
| `PERSONA.READ_ONLY` | ray@example.test | READ_ONLY |

All seeded with password `test-password`.

## Running locally

```bash
# 1. Provision Postgres + Mailpit (from docker-compose or
#    individual containers)
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_DB=breakfix_e2e \
  -e POSTGRES_USER=bf -e POSTGRES_PASSWORD=bf postgres:15

# 2. Migrate + seed
DATABASE_URL=postgresql://bf:bf@localhost:5432/breakfix_e2e \
  npx prisma migrate deploy
DATABASE_URL=postgresql://bf:bf@localhost:5432/breakfix_e2e \
  npm run db:seed:test

# 3. Build + run the app
DATABASE_URL=postgresql://bf:bf@localhost:5432/breakfix_e2e \
  npm run build
DATABASE_URL=postgresql://bf:bf@localhost:5432/breakfix_e2e \
  npm run start &

# 4. Install browsers + run
npm run e2e:install
npm run e2e
```

## Tags

- `@contrast` — §1E + §4C contrast pass; runs in light + dark
- `@persona` — §2A-§2G persona walks
- `@smoke` — §HOTFIX-2 + §1E route smoke

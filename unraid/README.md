# BreakFix Triage — Unraid templates

Two Unraid container templates that let you run BreakFix Triage entirely
from the Docker web UI. No SSH, no `docker compose`, no git clone on the
server.

## Templates

| File                     | What it deploys                                |
| ------------------------ | ---------------------------------------------- |
| `breakfix-postgres.xml`  | PostgreSQL 15 database (official alpine image) |
| `breakfix-triage.xml`    | BreakFix Triage app (pre-built from GHCR)      |

## Template URLs

Paste these into the "Template" field of Unraid's "Add Container" page.

```
https://raw.githubusercontent.com/aceospades95/breakfixtriage/claude/build-breakfix-operations-app-PRtY3/unraid/breakfix-postgres.xml
https://raw.githubusercontent.com/aceospades95/breakfixtriage/claude/build-breakfix-operations-app-PRtY3/unraid/breakfix-triage.xml
```

After the feature branch merges to `main`, replace
`claude/build-breakfix-operations-app-PRtY3` with `main`.

## Image source

The app image is built by `.github/workflows/docker-publish.yml` on every
push and published to:

```
ghcr.io/aceospades95/breakfixtriage:latest
```

The package must be set to public on GitHub the first time you publish it,
otherwise Unraid will fail to pull with "unauthorized":

1. After the first successful Actions run, go to
   https://github.com/users/aceospades95/packages/container/breakfixtriage/settings
2. Scroll to "Danger Zone" → "Change visibility" → **Public**.

## Required Docker network

Both containers must share a user-defined Docker network so they can
resolve each other by container name. Create it once:

```bash
docker network create breakfix-net
```

Then in Unraid's Docker settings, ensure "Preserve user defined networks"
is set to **Yes** so the network survives reboots.

See the main README.md at the repo root for the full step-by-step setup.

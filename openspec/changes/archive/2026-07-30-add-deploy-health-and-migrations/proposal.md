## Why

Two things the app service needs before it can deploy are missing.

The platform needs a path to poll to decide whether an instance is alive, and there is no health route. Every existing route either requires a session or reads the database, so pointing a health check at one of them would make a Postgres blip look like a dead container and cycle it.

Nothing applies migrations. The Dockerfile's `CMD` only starts the server, so a deployed image serves against whatever schema the database already has. Migrating from the start command is not the fix: past one instance, two containers starting together race on the same migration.

## What Changes

- Add `GET /api/health`, answering 200 from the process alone with no database query.
- Add `db/migrate.ts`, a one-shot script that applies pending migrations and exits, to run as a deploy job against the deployed image.
- Point `bun run db:migrate` at that script, so local and production apply migrations through one mechanism.
- **No change to any existing API route, status code, or response shape.**

## Capabilities

### New Capabilities
- `deploy-mechanics`: what the platform polls to decide an instance is healthy, and how schema migrations reach the deployed database.

### Modified Capabilities

None. No existing route changes, and the migration set on disk is untouched.

## Impact

- `api/index.ts`: the health route mounts ahead of the API tree, so the session middleware never runs for it. It is deliberately outside the typed `AppType` the UI builds its client from, since no UI code calls it.
- `db/index.ts`: the connection pool becomes exported so a one-shot script can close it and exit.
- `package.json` and the README Development section: `db:migrate` now runs `db/migrate.ts` instead of `drizzle-kit migrate`.
- Deploy configuration outside this repo: the platform needs the health path set and the migration job wired to run before a rollout.
- No database, contract, or environment change. `drizzle-orm` is already a production dependency.

## Context

The app service runs as one container: `bun api/index.ts` under `doppler run`. Its Hono app mounts every route under `basePath("/api")` behind a `use("*")` middleware that resolves the session on each request. Migrations live in `db/migrations`, are generated offline by `drizzle-kit generate`, and were applied locally by `drizzle-kit migrate`.

## Goals / Non-Goals

**Goals:**
- The platform can tell a live instance from a dead one.
- A failure in Postgres does not read as a failure of the container.
- The deployed database schema matches the deployed code.
- One migration mechanism, used the same way locally and in production.

**Non-Goals:**
- A deep health check that reports dependency status. That is monitoring, and it is a different signal from liveness.
- Zero-downtime schema changes. Migrations here still assume the old and new code can both run against the migrated schema for the length of a rollout.
- Automating the deploy itself. The platform owns rollout order.

## Decisions

### The health route reports the process, not its dependencies

A health check answers one question: should this instance be replaced. Postgres being briefly unreachable is not a reason to replace a healthy process — it is a reason to leave it alone, because a restart cannot fix a database and a restart loop makes recovery worse. So `GET /api/health` returns `200 {"status":"ok"}` and queries nothing.

### The health route mounts ahead of the API tree

The API tree's first middleware calls `auth.api.getSession` on every request. That is the exact dependency the route must not have, and putting the route inside the tree would inherit it.

Chosen: register `GET /api/health` on the outer app, before the API tree is mounted. Hono runs matching handlers in registration order, so the route answers and returns without the session middleware ever running. It also stays out of `AppType`, which is correct — no UI code calls it, and the typed client should not grow a route that exists for the platform.

Rejected: registering it inside the API tree and special-casing the session middleware to skip `/health`. That puts a deployment concern inside the auth path, where the cost of a mistake is much higher than a route registered one level up.

### Migrations run as a deploy job, never from the start command

Running migrations at start-up is the common shortcut and it breaks the moment the service scales: two instances boot together and race on the same migration. It also couples every restart to a schema write.

Chosen: a one-shot `db/migrate.ts` that applies pending migrations and exits, run as a job on the deployed image before the new service rolls out. One execution, one writer, and a failure stops the rollout instead of half-starting a service.

### The job uses drizzle-orm's migrator, not the drizzle-kit CLI

`drizzle-kit` is a dev dependency, and the runtime image installs with `--production`. It currently survives that prune only as an optional peer of `better-auth` — an accident, not a guarantee. The CLI would also need `drizzle.config.ts`, which the image does not copy.

Chosen: `migrate()` from `drizzle-orm/neon-serverless/migrator`, using the app's own pool. `drizzle-orm` and `@neondatabase/serverless` are production dependencies, so the job needs nothing the server does not already carry. Both paths read the same `db/migrations/meta/_journal.json` and record into the same `drizzle.__drizzle_migrations` table, so switching does not re-apply or skip anything.

Since the mechanism is now available in both places, `bun run db:migrate` points at the same script. One way to apply a migration, exercised locally every day.

The script resolves its folder from `import.meta.dir` rather than the working directory, so the job behaves the same however it is started, and closes the pool at the end so the process exits on its own instead of hanging on an idle connection.

## Risks / Trade-offs

- **A shallow health check will not notice a process that is up but useless** — for example, serving every request as a 500 because the database is gone. That is deliberate: catching it belongs to alerting on error rates, not to a liveness probe whose only response is a restart.
- **The migration job is ordered by the platform, not by the code.** If a rollout is configured to skip it, new code meets an old schema. The README states the ordering, but nothing in the repo enforces it.
- **Changing `db:migrate` changes a daily-use command.** Mitigated by both paths sharing the journal and the ledger table, and by the switch being verified against a live database before shipping.

# Tasks

## 1. Health route

- [x] 1.1 Add `GET /api/health` on the outer app, registered ahead of the API tree so the session middleware never runs for it.
- [x] 1.2 Test that it answers 200 with a JSON status body. The suite runs with no database reachable, so a pass is the proof it queries nothing.

## 2. Migration job

- [x] 2.1 Export the connection pool from `db/index.ts` so a one-shot script can close it.
- [x] 2.2 Add `db/migrate.ts` using `migrate()` from `drizzle-orm/neon-serverless/migrator`, resolving the folder from `import.meta.dir` and closing the pool at the end.
- [x] 2.3 Point `bun run db:migrate` at the script, and update the README Development section.

## 3. Document the deploy contract

- [x] 3.1 README: the health path to configure, and the migration job running before rollout rather than from the start command.

## 4. Verify

- [x] 4.1 Run the gate: `bash scripts/preflight.sh`.
- [x] 4.2 Run the migration job against a live database and confirm it is a no-op when nothing is pending.
- [x] 4.3 Probe `/api/health` in a container with no database configured and confirm 200 while a database-backed route fails.

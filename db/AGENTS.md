# db/

Drizzle + Neon Postgres.

- `schema.ts` — the one schema registry.
- `index.ts` — the pooled client and the pool's counts. The pool opens up to `DATABASE_POOL_MAX` connections,
  40 by default, and a request waiting for a connection fails after `DATABASE_CONNECT_TIMEOUT_MS`, 10 seconds by default.
- `quotas.ts` — the derived per-user limits, and `loadUserAccess`, the one read of a user's role, plan, and budget
  override, which the api and the worker share.
- `requestMemo.ts` — the reads one request repeats, its user's access and each topic role, kept in the request's
  async context. The api opens a memo for every request, and outside a request every read goes to the database.
- `queryTracing.ts` — counts each statement a request sends and traces it under the request's span. A write
  statement clears the memo of the request that sent it.
- `migrate.ts` applies pending migrations, and `seed.ts` has the dev stub data behind `bun run db:seed`.
- Schema changes edit `schema.ts`, then `bun run db:generate` writes the migration (offline, no
  doppler) and `bun run db:migrate` applies it (its script already runs under doppler). Never
  hand-edit an applied migration.
- All Postgres access goes through Drizzle here; no `Bun.sql`, `pg`, or raw clients anywhere.
- This module imports nothing app-level.
- Tests: `bun test db`.

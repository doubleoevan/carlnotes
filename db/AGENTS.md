# db/

Drizzle + Neon Postgres. `schema.ts` is the one schema registry; `quotas.ts` holds the derived
per-user limits; `index.ts` exports the pooled client and reads the pool's counts; `queryTracing.ts` counts each
statement a request sends and traces it under the request's span; `migrate.ts` applies pending migrations;
`seed.ts` holds the dev stub data behind `bun run db:seed`.

- Schema changes edit `schema.ts`, then `bun run db:generate` writes the migration (offline, no
  doppler) and `bun run db:migrate` applies it (its script already runs under doppler). Never
  hand-edit an applied migration.
- All Postgres access goes through Drizzle here; no `Bun.sql`, `pg`, or raw clients anywhere.
- This module imports nothing app-level.
- Tests: `bun test db`.

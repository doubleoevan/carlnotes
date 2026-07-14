## Why

CarlNotes has a scaffolded `db/` module but no schema — every downstream MVP change (ingestion, curation, feed, scans) needs the domain tables to exist first. This change lands the persistence layer: eight domain tables (Feed stays a route, not a table) plus `users` and `audience_members`, and the initial migration, so the rest of the MVP has a real database to build against.

## What Changes

- Add Drizzle ORM, a Neon Postgres driver, and drizzle-kit; wire a `drizzle.config.ts` and the `db:generate` / `db:migrate` scripts.
- Define the domain schema in `db/schema.ts`: `topics`, `sources`, `scans`, `resources`, `findings`, `subscriptions`, `audiences`, `audience_members`, `integrations`, plus a minimal Better-Auth-shaped `users` table.
- **Feed is a concept and a route, not a table** — `findings` reference `topic_id` directly; a topic's Feed is the query over its findings.
- `resources` carry a nullable pgvector `embedding` plus a nullable `embedding_model` column — null at ingestion, filled when the pipeline embeds — so switching embedding models is a backfill, not a schema crisis.
- Expose a typed Drizzle client from the `db` module for `api` and `worker` to consume.
- Generate the initial SQL migration, then manually prepend `CREATE EXTENSION IF NOT EXISTS vector` (drizzle-kit does not emit it).
- Update the README Development section with the new `db:*` scripts.

## Capabilities

### New Capabilities
- `domain-schema`: the persisted domain model — the nine canonical entities, their relationships and constraints, global Resource dedupe, topic-scoped Findings, the pgvector-backed embedding on Resource, and the initial migration that creates them.

### Modified Capabilities
<!-- none: no existing specs in openspec/specs/ -->

## Impact

- **New dependencies:** `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` (Neon driver).
- **Code:** `db/schema.ts` (new, the domain model), `db/index.ts` (client export, replaces the placeholder), `drizzle.config.ts` (new), `db/migrations/` (generated SQL).
- **Config:** `package.json` scripts (`db:generate`, `db:migrate`); `DATABASE_URL` already documented in `.env.example`. Requires the `vector` extension on the Neon database.
- **Tooling:** `biome.json` aligned to the `code-style` skill (`semicolons: "asNeeded"`, `lineWidth: 120`, `db/migrations` excluded as a generated tree) — a repo-wide formatting change that reformatted existing scaffold files (`ui/`, `api/`, `worker/`, configs).
- **Contract:** establishes the table/column names every later change (`api`, `worker`) imports. Keep in sync with the `domain-model` skill and the Notion domain-model table.
- **Deferred:** per-user consumed state (lands with Feed UI), any vector index (added when corpus size warrants), the Subscription→Integration delivery reference (lands with delivery work), and Better Auth fully owning `users` (launch week).

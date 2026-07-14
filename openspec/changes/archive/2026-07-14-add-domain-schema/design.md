## Context

`db/` is a placeholder (`export {}`); nothing depends on it yet, so this is a greenfield schema with no migration history and no rollback of existing data to worry about. The stack is fixed by the decision log: Neon Postgres + Drizzle + pgvector, Bun runtime, one `package.json`, module boundaries enforced by tsconfig project references (`db` imports nothing app-level; `api`/`worker` import `db`). Architecture pins `db/schema.ts` as "the domain model." Two shaping decisions are already made: Feed is a concept/route (no table), and a minimal Better-Auth-shaped `users` table lands now.

## Goals / Non-Goals

**Goals:**
- One `db/schema.ts` defining the eight domain tables + `users` + `audience_members`, matching the `domain-model` skill exactly.
- Resource carries a pgvector `embedding` + `embedding_model`.
- A generated initial migration that enables pgvector and creates every table, applied with one command.
- A typed Drizzle client the rest of the MVP imports.

**Non-Goals:**
- Any query, route, adapter, or pipeline logic (later changes).
- Per-user consumed state (lands with Feed UI, multi-user).
- A vector similarity index (added when corpus size warrants).
- Better Auth wiring itself (launch week) — this only shapes `users` so adoption is clean.
- Extracting enum values to `shared/` (lands with the Feed UI change).

## Decisions

**Driver: `@neondatabase/serverless` Pool via `drizzle-orm/neon-serverless`.**
Over `neon-http` (simpler, but no multi-statement transactions) and `node-postgres` (not the Neon-recommended serverless path). The curation pipeline (next change) upserts Resources + Findings + Scan counts together and wants a transaction; the WebSocket Pool driver supports both transactions and one-shot queries, so we pick once and don't re-thread every call site later. Honest cost: WebSocket setup adds a little latency the HTTP driver avoids — acceptable for a bursty background workload.

**File layout — fewest files, no re-export barrel.**
- `db/schema.ts` — all tables + pgEnums (the domain model, one file per Architecture).
- `db/index.ts` — constructs and exports the `db` client only. Consumers import table defs directly from `db/schema` and the client from `db`, so `index.ts` is not a re-export barrel (code-style rule).
- `drizzle.config.ts` — repo root (drizzle-kit's default discovery location).
- `db/migrations/` — generated SQL, committed.

**pgvector dimension: 768.**
BGE/GTE-class open models via Fireworks are 768-dim; smaller dims keep pgvector fast. The `embedding_model` column means a later model swap is a re-embed backfill (and, if dims differ, one `ALTER COLUMN`), not a redesign. Declared as `vector({ dimensions: 768 })`. Both `embedding` and `embedding_model` are nullable: adapters insert Resources at ingestion and the pipeline fills embeddings in a later stage.

**Extension creation is a one-time manual prepend to the `0000` migration.**
drizzle-kit does not emit `CREATE EXTENSION`. After `db:generate`, prepend `CREATE EXTENSION IF NOT EXISTS vector;` to the generated `0000_*.sql` so it runs before `resources` is created. drizzle-kit only appends future diffs, so the hand-edit to `0000` is stable. Alternative (a separate custom migration ordered before `0000`) is more moving parts for the same effect.

**No vector index at MVP.** `ponytail:` sequential scan over ~40 resources/scan is fine; add an HNSW index on `resources.embedding` when the corpus or query latency demands it.

**Migration tooling: `drizzle-kit generate` + `drizzle-kit migrate`, no custom runner.**
Scripts: `db:generate` (offline — diffs schema vs history, needs no DB, so cloners can run it) and `db:migrate` (applies pending SQL, needs `DATABASE_URL`, run under `doppler run` or `.env`). A hand-written migrator script would duplicate what the CLI already does.

**Primary keys: `text` ids app-generated with `crypto.randomUUID()`.**
Matches Better Auth's string-id convention so `users` adoption is seamless, and stays uniform across every table. Over `uuid`/`serial`: those would force a type mismatch the day Better Auth takes over `users`.

**Polymorphic subscriber: two nullable FKs + a `CHECK`.**
`subscriptions` gets `subscriber_user_id` → `users` and `subscriber_audience_id` → `audiences`, both nullable, with a table `CHECK` that exactly one is set. Referentially sound, unlike a `subscriber_type` + untyped `subscriber_id` pair that no FK can protect.

**Enums via `pgEnum` in `schema.ts`.**
`source_kind` {rss, reddit, youtube, search, composio, plugin}, `resource_kind` {read, watch, listen}, `privacy` {public, invite, private}, `cadence` {daily, weekly} (shared by Topic scan cadence and Subscription delivery), `scan_status` {running, succeeded, failed}, `source_visibility` {public, private}, `thumbs` {up, down}. Enums start minimal — Postgres adds enum values easily but cannot drop them — so `cadence` omits sub-daily until a change needs it. These are the const arrays the Architecture "open" item earmarks for `shared/` later; kept in `db` until `shared/` lands.

## Risks / Trade-offs

- **Hand-edited `0000` migration could be lost on a careless regen** → the edit is to an already-generated file drizzle-kit never rewrites; a `tasks.md` step verifies the extension line survives, and a fresh-DB apply is part of verification.
- **Module-level Pool constructed with a missing `DATABASE_URL`** (cloners without app secrets, or tests) → the Neon Pool defers connecting until first query, so import and `tsc -b`/`bun test` don't fail; only a real query needs the URL.
- **`users` shaped by hand may drift from Better Auth's exact expectations** → a task fetches the current Drizzle-adapter columns and mirrors them exactly; any launch-week gap reconciles in one migration, cheaper than no FKs at all.
- **768 dims guesses the model family** → isolated to one column; `embedding_model` + a backfill absorb a change.
- **`@neondatabase/serverless` needs a WebSocket constructor** → it targets serverless JS; under Bun the constructor may need wiring (`neonConfig.webSocketConstructor`). A post-migrate smoke query proves the driver path by execution rather than trusting types.

## Migration Plan

1. Install `drizzle-orm`, `@neondatabase/serverless`, and `drizzle-kit` (dev).
2. Write `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`; add `db:generate` / `db:migrate` scripts; document them in the README Development section (AGENTS.md rule).
3. `bun run db:generate` → prepend the pgvector extension to `0000_*.sql` → commit `db/migrations/`.
4. Apply to a Neon dev branch: `doppler run -- bun run db:migrate`; confirm every table and the extension exist.
5. Rollback: greenfield — drop the tables / reset the Neon branch. No data migration.

## Open Questions

- Exact Better Auth core-column set (names/nullability) — resolved during implementation by task 2.2 (fetch the current Drizzle-adapter columns and mirror them); safe to proceed.
- Whether `cadence` should carry a `2×/day` option now — deferred; the roadmap treats sub-daily cadence as a Pro-tier concern, so the enum starts minimal and grows via an OpenSpec change.

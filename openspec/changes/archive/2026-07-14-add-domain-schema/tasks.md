## 1. Dependencies & config

- [x] 1.1 Install runtime deps: `bun add drizzle-orm @neondatabase/serverless`
- [x] 1.2 Install tooling: `bun add -d drizzle-kit`
- [x] 1.3 Add `db:generate` (`drizzle-kit generate`) and `db:migrate` (`drizzle-kit migrate`) to `package.json` scripts
- [x] 1.4 Create `drizzle.config.ts` at repo root: `dialect: "postgresql"`, `schema: "./db/schema.ts"`, `out: "./db/migrations"`, `dbCredentials.url` from `process.env.DATABASE_URL`

## 2. Schema — `db/schema.ts`

- [x] 2.1 Define pgEnums: `source_kind`, `resource_kind`, `privacy`, `cadence` {daily, weekly}, `scan_status` {running, succeeded, failed}, `source_visibility`, `thumbs`
- [x] 2.2 Fetch Better Auth's current core user columns from its Drizzle adapter docs; record the exact column set (names, types, nullability) to mirror
- [x] 2.3 `users` table — mirror those Better Auth core columns exactly: `id` (text PK, `crypto.randomUUID()`), `email` (unique), `email_verified`, `name`, `image`, `created_at`, `updated_at`
- [x] 2.4 `integrations` table — `user_id` → users, provider/kind, scopes, grant fields
- [x] 2.5 `topics` table — `owner_id` → users, `name`, `context_doc`, `cadence`, `privacy`; no role column
- [x] 2.6 `sources` table — `topic_id` → topics, `kind` (source_kind), `integration_id` → integrations **nullable**, `config` jsonb
- [x] 2.7 `scans` table — `topic_id` → topics, `started_at`, `finished_at`, `status` (scan_status), nullable `error`, `cost`, counts, `ai_summary`
- [x] 2.8 `resources` table — `url` (unique, canonical-dedupe key), `content_hash`, `kind` (resource_kind), **nullable** `embedding` (`vector({ dimensions: 768 })`), **nullable** `embedding_model`, title/timestamps; global, no topic_id
- [x] 2.9 `findings` table — `topic_id` → topics, `resource_id` → resources, `scan_id` → scans, `signal_score`, `why_summary`, `source_visibility`, `thumbs` (nullable); **unique(topic_id, resource_id)** so re-scoring updates in place
- [x] 2.10 `audiences` table (`owner_id` → users, `name`) and `audience_members` join (`audience_id` → audiences, `user_id` → users)
- [x] 2.11 `subscriptions` table — `topic_id` → topics, nullable `subscriber_user_id` → users and `subscriber_audience_id` → audiences, `cadence`, `digest`; table `CHECK` that exactly one subscriber is set

## 3. Client — `db/index.ts`

- [x] 3.1 Replace the `export {}` placeholder: construct a `neon-serverless` Pool from `DATABASE_URL` and export `db = drizzle({ client, schema })`; set `neonConfig.webSocketConstructor` if the Bun runtime requires it (the 4.4 smoke test confirms)
- [x] 3.2 Confirm `db/index.ts` is not a re-export barrel — consumers import table defs from `db/schema` directly

## 4. Migration

- [x] 4.1 `bun run db:generate` to produce `db/migrations/0000_*.sql`
- [x] 4.2 Prepend `CREATE EXTENSION IF NOT EXISTS vector;` to the generated `0000_*.sql` so it runs before `resources`
- [x] 4.3 Apply against a Neon dev branch: `doppler run -- bun run db:migrate`; confirm the extension and all ten tables exist, and the subscriber `CHECK` is present
- [x] 4.4 Post-migrate smoke: run one `select` through the exported `db` client (e.g. count `users`) to verify the Bun WebSocket driver path by execution, not just by types
- [x] 4.5 Stage `db/migrations/` (committed migration history)

## 5. Verify & document

- [x] 5.1 Add `db/schema.test.ts` — structural self-check (no DB): `resources.embedding` has 768 dims, `embedding`/`embedding_model` are nullable, no `feeds` table/export exists, `sources.integration_id` is nullable, subscriptions expose both subscriber columns, and the generated `0000_*.sql` contains `CREATE EXTENSION IF NOT EXISTS vector`
- [x] 5.2 Document `db:generate` / `db:migrate` in the README Development section (AGENTS.md script-doc rule)
- [x] 5.3 Confirm `db/schema.ts` vocabulary matches the `domain-model` skill exactly — nine entities, zero rejected domain nouns
- [x] 5.4 `bun run check` green (Biome + `tsc -b` + tests)

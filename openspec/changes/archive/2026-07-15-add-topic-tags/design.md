## Context

The `topics` table in `db/schema.ts` is a plain-object `pgTable` (no extra-config array) carrying `name`, `context`, `cadence`, `privacy`, `owner_id`, and timestamps. Migrations are drizzle-kit generated (`bun run db:generate` → `db/migrations/000N_*.sql`). Nothing reads or writes tags today; this change only provisions the column and its index so later feed-filtering and directory work has somewhere to store them.

## Goals / Non-Goals

**Goals:**
- Give every Topic a valid, queryable tag set with zero backfill.
- Keep tag filters index-backed via a GIN index.

**Non-Goals:**
- No Tag entity, `tags` table, join table, or normalization/validation layer.
- No API, UI, adapter, or pipeline changes — no reader or writer of tags yet.
- No new access enforcement. The existing model already covers tags: writing them mutates Topic config, so it is owner-only (authority = `topic.owner_id`); cross-user tag search respects Topic `privacy` — a searcher matches tags only on topics they can already reach (public, or invite/private via a Subscription path). The writer and search endpoints enforce this when they land.
- Resources and Findings stay untagged.

## Decisions

**`text[]` column, non-null, default empty.** `tags: text("tags").array().notNull().default([])` — drizzle emits `DEFAULT '{}'`, so existing rows get an empty array with no backfill and the app never handles null. A `text[]` (over a `tags` table or jsonb) is the lightest fit for a flat label set and pairs directly with array operators. If the generated default is not exactly `'{}'`, pin it with `.default(sql\`'{}'::text[]\`)`.

**GIN index with default `array_ops`.** `topics.tags` is indexed `USING gin` so `@>` (has-all) and `&&` (has-any) filters are index-backed — the access pattern for feed filtering and directory categories. Default `array_ops` covers array containment/overlap; no operator-class or extension is needed. Adding an index means converting `topics` to the extra-config form `pgTable("topics", {…}, (table) => [index("topics_tags_gin").using("gin", table.tags)])`, matching how `findings` and `subscriptions` already attach table-level config.

**Tags as metadata, not an entity.** No new noun — avoids the rejected `Tag`/`List`/`Group` framing and keeps the domain model unchanged. Tags are just columns on the existing Topic.

## Risks / Trade-offs

- **Free-form tags drift (casing, typos, synonyms)** → out of scope now; when a directory taxonomy is defined, normalization/validation lands with the writer. The column stays as-is.
- **GIN write amplification on tag updates** → negligible: Topics are low-write config rows, not high-churn.

## Migration Plan

1. Add the column + GIN index to `topics` in `db/schema.ts`; run `bun run db:generate`.
2. Confirm the migration only adds the `text[]` column (`DEFAULT '{}' NOT NULL`) and creates the GIN index — non-null with a default, so existing rows need no backfill.
3. Rollback: drop the index and column — no other table or code references tags.

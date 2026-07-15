## Why

Feeds and a future public directory need to filter and categorize Topics, but a Topic today carries no free-form labels. Tags are the lightest way to add that: metadata on the existing entity, not a new one.

## What Changes

- Add a `tags` `text[]` column to the `topics` table, non-null and defaulting to the empty array `{}`, so every existing and future Topic has a valid (empty) tag set with no backfill.
- Add a GIN index on `topics.tags` so containment/overlap filters (`tags @> …`, `tags && …`) for feed filtering and directory categories stay index-backed.
- Explicitly NOT a new entity: no `tags` table, no join table, no Tag domain noun. Tags are plain Topic metadata. Resources and Findings stay untagged.
- Include the generated Drizzle migration.

## Capabilities

### New Capabilities

<!-- none — this extends an existing capability -->

### Modified Capabilities

- `domain-schema`: the `topics` table gains a non-null `tags` `text[]` column (default empty) with a GIN index, as Topic metadata for filtering and categorization.

## Impact

- Code: `db/schema.ts` (add the column + GIN index to `topics`) and the generated migration under `db/migrations/`.
- Unchanged: every other table, the scan/curation pipeline, and all adapters — nothing reads or writes tags yet.
- No new dependencies.

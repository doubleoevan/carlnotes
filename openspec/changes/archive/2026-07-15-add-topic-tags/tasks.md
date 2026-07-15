## 1. Schema

- [x] 1.1 Add a `tags` (`text[]`) column to the `topics` table in `db/schema.ts`: `text("tags").array().notNull().default([])`, with a comment noting it is Topic metadata for feed filtering and directory categories (empty by default).
- [x] 1.2 Convert `topics` to the extra-config form and add a GIN index on `tags`: `(table) => [index("topics_tags_gin").using("gin", table.tags)]` (import `index` from `drizzle-orm/pg-core`).
- [x] 1.3 Generate the migration with `bun run db:generate` and confirm it only adds the `text[]` column (`DEFAULT '{}' NOT NULL`) and creates the GIN index. If the generated column default is not `'{}'`, switch to `.default(sql\`'{}'::text[]\`)` and regenerate.

## 2. Verification

- [x] 2.1 Run the verification gate: `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 2.2 Validate the change: `openspec validate add-topic-tags --strict`.

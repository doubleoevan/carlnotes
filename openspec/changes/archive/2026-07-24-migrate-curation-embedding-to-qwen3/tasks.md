## 1. Schema and migration

- [x] 1.1 `db/schema.ts`: change `resources.embedding` to `vector("embedding", { dimensions: 1024 })`
- [x] 1.2 Run `bun run db:generate`, read the generated SQL, and hand-edit the new migration to `UPDATE resources SET embedding = NULL, embedding_model = NULL;` before the `ALTER`, since 768-wide vectors cannot cast in place
- [x] 1.3 Confirm the generated migration touches no vector index (none exists) and alters only `resources.embedding`
- [x] 1.4 Update fixtures for the new dimension: `db/schema.test.ts` (assert the migration alters to `vector(1024)`; fix the 768 comment) and `worker/scan.smoke.ts` (`embedding is 1024-dim`)

## 2. Embedding pipeline

- [x] 2.1 Define `EMBED_DIMENSIONS` in `db/schema.ts` (the `embedding` column references it too, so they can't drift); in `worker/review.ts` change `EMBED_MODEL_NAME` to name the vector space (`qwen3-embedding-8b/${EMBED_DIMENSIONS}`, not the alias) and `EMBED_COST_PER_MILLION_TOKENS` from `0.008` to `0.10`
- [x] 2.2 `worker/models.ts`: add `embedVector`, the single choke point — call the proxy, assert the raw vector is at least `EMBED_DIMENSIONS` long, slice to the first `EMBED_DIMENSIONS`, then L2-normalize (guard the zero-norm case). Route `review.ts`'s `embedDocument` (plain) and `embedQuery` (Qwen3 `Instruct: {task}\nQuery: {text}`) through it, so no direct `embed()` call is left outside `embedVector`
- [x] 2.3 `worker/review.ts`: leave `MAX_EMBED_CHARS` at 8000 (Qwen3's 40k context is a possible follow-up, out of scope here)
- [x] 2.4 `worker/models.ts`: fix the `embedModel` comment that hardcodes 768 (the dimension is now requested per call)

## 3. Backfill

- [x] 3.1 Write a throwaway backfill script under `worker/` (module boundaries: `db` cannot import `worker`) that selects every Resource with a title, snippet, or content, re-embeds each through `embedVector`, and stores the vector plus the vector-space `embedding_model`. Pre-launch only dev holds data, so run it once against dev then delete it — do not keep it in the codebase

## 4. Verification

- [x] 4.1 Gate: `bunx biome check .`, `bunx tsc -b`, `bun test`
- [x] 4.2 Apply the migration to the dev database: `bun run db:migrate`
- [x] 4.3 Make one live call through `embedVector` under Doppler and assert the returned length is exactly 1024 (a raw proxy call still returns 4096, which is expected and is why the helper truncates)
- [x] 4.4 Run the backfill under the Doppler dev config against the Neon dev branch, then delete the one-off script
- [x] 4.5 Post-check the dev database: no `resources` row has a non-null `embedding` with a null `embedding_model`

## Why

Curation embeds with `nomic-embed-text-v1.5` at 768 dimensions. We are moving to `qwen3-embedding-8b` at 1024 dimensions for stronger retrieval quality on the relevance gate and the near-duplicate dedupe. The old model also left three pieces of bookkeeping wrong — the `embedding_model` stamp records the LiteLLM alias instead of the real vector space, the embedding cost rate is nomic's, and the pipeline treats the model as prefix-based when Qwen3 is instruction-aware — so the migration fixes those in the same change rather than leaving latent drift.

## What Changes

- **BREAKING** `resources.embedding` becomes a 1024-dimension vector. Stored 768-wide vectors cannot cast in place, so the migration nulls `embedding` and `embedding_model` before the `ALTER`. There is no vector index on the column, so nothing is dropped or rebuilt.
- Every embedding goes through one helper that truncates the proxy's 4096-wide vector to the first 1024 and L2-normalizes the slice. This is MRL-safe: qwen3 packs the most important dimensions first, so the first 1024 retain ~95% retrieval quality, but the slice must be re-normalized or cosine distance is wrong. The proxy drops the `dimensions` parameter (`drop_params` is on and it mistags qwen3 as not supporting dimensions), so the client is the source of truth, not the proxy.
- `embedding_model` now records the vector space — the underlying model and its dimension — instead of the routing alias `embed-model`, so a future model change is a detectable backfill.
- The embedding cost rate moves from nomic's `0.008` to Qwen3's `0.10` per million tokens, since the per-Scan spend cap reads it.
- Qwen3's query-side instruction is applied to the topic-context embedding only (the query side); Resource embeddings (the document side) stay plain text, per Qwen's guidance. The two call sites share one embed seam so they cannot drift.
- A one-off backfill re-embeds every Resource that has a title, snippet, or content. Nulling is not self-healing: the pipeline skips Resources that already have a Finding, so scored Resources would otherwise never be re-embedded and would silently drop out of the dedupe pool. The script runs once against the dev database — the only one with data pre-launch — and is then deleted, not kept in the codebase.
- `MAX_EMBED_CHARS` stays at 8000 in this change. Qwen3's context is 40k, so raising it is noted as a possible follow-up, not done here.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `curation`: the embedding requirement changes — dimension 768 → 1024, the recorded model identifies the vector space, and Qwen3's instruction is applied to the query side only.
- `domain-schema`: the Resource `embedding` column is a 1024-dimension vector, and a model/dimension change is now a schema migration plus a re-embed backfill, not a pure backfill.

## Impact

- Code: `db/schema.ts`, a new migration (`0017`), `worker/review.ts`, `worker/models.ts`, a new one-off backfill script under `db/`, and the fixtures in `db/schema.test.ts` and `worker/scan.smoke.ts`.
- Infrastructure: `litellm-config.yaml` already repoints `embed-model` to `qwen3-embedding-8b` with `dimensions: 1024` and `drop_params: true`. The backfill must run per environment against that environment's database (dev is the Neon dev branch under the Doppler dev config).
- Data: every existing `resources.embedding` is nulled by the migration and repopulated by the backfill; a live embed call verifies the 1024 length before the backfill runs.

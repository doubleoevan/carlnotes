## Context

Curation (`worker/review.ts`) embeds each Resource's title and snippet and the topic's effective context through the LiteLLM-routed `embed-model` alias, storing 768-wide vectors in `resources.embedding`. Two stages depend on the vectors: the near-duplicate dedupe (`hasNearDuplicate`, Resource-vs-Resource) and the relevance gate (`cosineSimilarity` of a Resource against the topic context). The alias now points at `qwen3-embedding-8b` in `litellm-config.yaml` with `dimensions: 1024` and `drop_params: true`, so the code and schema must catch up. Constraints: cosine similarity is silent on a vector-space mismatch (it returns a plausible-but-wrong number), so consistency between the two call sites is load-bearing; and `loadUnscoredResources` excludes any Resource that already has a Finding, so re-embedding is not something a normal Scan will do for the existing corpus.

## Goals / Non-Goals

**Goals:**
- Store 1024-dimension `qwen3-embedding-8b` vectors and prove the length end to end before trusting any comparison.
- Record a vector-space identity on each row (model + dimension), not the routing alias, so the next model change is a detectable, deliberate backfill.
- Apply Qwen3's instruction correctly: query side only, document side plain, from one shared seam so the two sites cannot drift.
- Re-embed the whole existing corpus so nothing silently drops out of the dedupe pool.
- Fix the embedding cost rate the spend cap reads.

**Non-Goals:**
- Raising `MAX_EMBED_CHARS` from 8000 toward Qwen3's 40k context (a separate change: it shifts every vector and needs its own backfill).
- Adding a vector index (none exists today; not introduced here).
- Changing dedupe or relevance thresholds — the new model may warrant re-tuning them, but that is measured separately.

## Decisions

- **Truncate and normalize client-side, in one choke point.** The proxy drops the `dimensions` parameter (`drop_params` is on and it mistags qwen3 as unsupported), so a call through it returns qwen3's full 4096-wide vector. Rather than depend on the proxy, one helper — `embedVector` in `worker/models.ts`, the only place `embed()` is called — takes the raw vector, asserts it is at least `EMBED_DIMENSIONS` long (so a future shorter model fails loud, never pads), slices to the first `EMBED_DIMENSIONS`, and L2-normalizes the slice. MRL packs the most important dimensions first, so the first 1024 keep ~95% retrieval quality, but the slice must be re-normalized or cosine distance is wrong. Every caller routes through this helper; no direct `embed()` call is left outside it. Verified with one live call before the backfill: the helper returns 1024, while a raw proxy call still returns 4096, as expected.
- **`embedding_model` records the vector space as a constant.** Checked the installed AI SDK: `EmbedResult` has no `modelId`; only `response.body` (typed `unknown`), and LiteLLM returns the routing alias `embed-model` there, not the underlying model. So the resolved id is not cleanly available at call time, and the useful value — the model and its dimension — is known statically. The stamp becomes `qwen3-embedding-8b/1024`. Alternative rejected: parsing `response.body.model`, which yields the alias and needs an unsafe cast.
- **Qwen3 instruction on the query side only.** Verified against Qwen's model card: queries use `Instruct: {task}\nQuery: {text}`; documents are plain text; omitting the query instruction costs ~1–5% retrieval quality. In this pipeline the topic context (`loadTopicContext`) is the query and each Resource (`embedResource`, and the backfill) is a document. Both go through one seam — `embedQuery` adds the instruction, `embedDocument` does not — so the model, the dimension, and the convention stay consistent by construction. Resource-vs-Resource dedupe stays document-vs-document, so it needs no instruction.
- **Backfill is a required, separate, throwaway step.** Nulling `embedding` does not self-heal because scored Resources are skipped by every future Scan; they would keep a null embedding and disappear from `hasNearDuplicate`'s pool. A one-off script re-embeds every Resource with a title, snippet, or content through `embedVector`, stamping the model. Pre-launch, only the dev database holds data, so it runs once against dev and is then deleted rather than kept in the codebase.
- **Cost rate 0.10 per million tokens.** Qwen3 8B's rate, replacing nomic's 0.008. Best-effort only — it feeds the soft per-Scan cap; LiteLLM meters authoritative spend and the per-user key budget is the hard ceiling.

## Risks / Trade-offs

- The proxy returns qwen3's full 4096-wide vector because it drops `dimensions` → this is the expected path: the single helper truncates and re-normalizes to `EMBED_DIMENSIONS`, and asserts the raw vector is long enough so a future shorter model fails loud instead of padding.
- The two call sites diverge (different model or convention) and cosine similarity degrades with no error → a single shared embed seam is the only path to the model; the query/document split is the only difference between them.
- Scored Resources keep null embeddings and drop out of dedupe → the backfill re-embeds the full corpus; a post-check asserts no row has a non-null `embedding` with a null `embedding_model`.
- 768 and 1024 vectors coexist and get compared → the migration nulls every embedding in the same statement as the `ALTER`, so no stale-width vector survives; comparisons resume only after the backfill.

## Migration Plan

1. Apply migration `0017`: `UPDATE resources SET embedding = NULL, embedding_model = NULL;` then `ALTER TABLE resources ALTER COLUMN embedding TYPE vector(1024);` (drizzle generates the `ALTER`; the null `UPDATE` is hand-added ahead of it).
2. Make one live embed call through the helper under Doppler and assert the returned length is exactly 1024. A raw proxy call still returns 4096, which is expected and is why the helper truncates.
3. Run the one-off backfill under the Doppler dev config against the Neon dev branch, then delete the script (pre-launch, only dev holds data).
4. Post-check: no `resources` row has a non-null `embedding` with a null `embedding_model`.

Rollback is a re-embed, not a data restore: embeddings are derived, so reverting the model means pointing the alias back, restoring the 768 column via its own null-then-`ALTER` migration, and re-running the backfill.

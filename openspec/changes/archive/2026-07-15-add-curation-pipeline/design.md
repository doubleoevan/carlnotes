## Context

Ingestion shipped: `runTopicScan` (`worker/scan.ts`) runs a Topic's Sources through their adapters, dedupes Resources by canonical URL, upserts them (`onConflictDoNothing` on `url`), and closes the Scan with `found_count`, `cost`, `degraded_sources`, and `status`. It stops there by design — the source-ingestion spec states `kept_count`, `filtered_count`, `ai_summary`, embeddings, and Findings "belong to curation." So no Resource is scored and every Feed is empty. This change is that second half.

The substrate decision (owner call): **hybrid, staged.** The cheap stages — hash dedupe, embed, embedding dedupe, embed-filter — run on **adapter-native text** (title + the description/selftext/highlights the Source's API already returns), so they need no fetch. Only Resources that survive the embed-filter are **Firecrawl-fetched** for full content, and only fetched survivors are **LLM-scored**. This ordering is the spend-control architecture: the embed-filter is the gate, so the two paid operations (fetch, scoring) only ever touch media already judged relevant by a free vector comparison.

Constraints that shape the design:
- **Module boundaries** (`tsconfig` project references, gated by `bunx tsc -b`): `worker` references only `db`. Everything here lives in `worker` — it needs the LLM seam (`worker/llm.ts`), the topic-context reader (`worker/attachments.ts` → `topicScanContext`), and `db`.
- **The LLM seam is LiteLLM-only, fail-fast.** `worker/llm.ts` builds an OpenAI-compatible client against `LITELLM_BASE_URL`/`LITELLM_MASTER_KEY` and throws when either is unset, so a misconfigured proxy fails inside the Scan (isolated) rather than defaulting to `api.openai.com`. Curation's embed and score seams extend that exact pattern.
- **pgvector is provisioned.** `resources.embedding` is `vector(768)`; the initial migration enabled the extension. No embedding has ever been written yet — curation is the first writer.
- **Tests are structural/offline** (no live network), matching `search.test.ts` / `attachments.test.ts`: pure functions (hashing, normalization, threshold decisions, cost tally, prompt building) are unit-tested; the embed/score/fetch wrappers are thin and left to a live smoke.
- **Cost is best-effort at the app layer.** The search adapter already set the precedent: it records Exa's reported dollar cost and the spec notes "LiteLLM meters authoritative spend." Curation's `stage_costs` and spend cap follow the same rule — best-effort dollar estimates for control and display; LiteLLM's meter is the source of truth.

## Goals / Non-Goals

**Goals:**
- Turn a Scan's newly discovered Resources into topic-scoped Findings, spending an LLM call only on media that passed a free relevance gate.
- Keep the paid surface minimal and bounded: fetch and score only embed-filter survivors, under a per-Scan USD ceiling.
- Record where the money went: a per-stage `stage_costs` breakdown, with `cost` the total.
- Add **zero** dependencies — reuse the AI SDK, the OpenAI-compatible provider, Drizzle's vector helpers, and raw `fetch`.
- Preserve offline-test discipline: the decisions (dedupe, threshold, cap, cost tally, prompts) are pure and tested; the network wrappers are thin.

**Non-Goals:**
- **OCR / vision for image-only pages.** Firecrawl returns what it returns; an image-only page yields thin content, scoring falls back to the snippet. A vision path is a later upgrade if evals show it matters.
- **Re-embedding backfill when the embedding model changes.** Embeddings are stamped with `embedding_model`; a model change is a backfill over stored `content`/`snippet`, not part of this change. The raw `content` is retained precisely so re-extraction is possible.
- **Cross-topic score reuse.** A Resource relevant to Topic A is re-scored for Topic B (Findings are topic-scoped, and relevance is context-specific). Reusing A's score as a prior for B is a later optimization.
- **LiteLLM per-virtual-key budgets.** Infra-level spend control (per-user keys, `LITELLM_DATABASE_URL` spend tracking) complements the app-level per-Scan cap and lands with per-user keys at launch. This change caps at the app layer.
- **The HTTP/schedule trigger.** `runTopicScan` is still invoked directly (by tests today, by the Temporal schedule when it is wired) — same posture as ingestion.
- **A vector index (HNSW/IVFFlat).** MVP volume is small enough for an exact scan; the index is a one-line migration to add when the `resources` table grows (see Risks).

## Decisions

**Curation is a phase of `runTopicScan`, in its own module — not a separate Scan or workflow.**
A Scan is "one execution of a topic's pipeline," and `kept_count`/`filtered_count`/`ai_summary` already live on the Scan row waiting for exactly this. So curation runs inside the same Scan: `worker/scan.ts` upserts Resources, then calls `curateScan(scan, resources)` from a new `worker/curation.ts`, then closes the Scan once with ingestion's and curation's outputs merged. The Scan stays `running` across both phases; a curation throw hits the same `catch` that already finalizes the Scan as `failed`. Alternative — a second Scan row, or a Temporal child workflow per stage — buys durable per-stage retry we do not need yet and fights the single-Scan cost/count model. `ponytail: curation is an in-process phase; promote stages to Temporal activities only when per-stage durability/retry is worth the plumbing.`

**Zero new dependencies — raw `fetch`, AI SDK `embed`, Drizzle `cosineDistance`.**
- *Firecrawl* is called with raw `fetch` against its scrape endpoint, keyed by `FIRECRAWL_API_KEY`, bounded by an `AbortSignal.timeout` — the exact shape the Exa search adapter established. The `@mendable/firecrawl-js` SDK is transitive weight for one POST; rejected on the same grounds the AWS SDK was rejected for storage.
- *Embeddings* go through the AI SDK's `embed`/`embedMany` over the existing `@ai-sdk/openai` provider pointed at LiteLLM — `createOpenAI({ baseURL, apiKey }).textEmbeddingModel("embed-model")`. Same provider, same proxy, new model id.
- *Vector similarity* uses Drizzle's `cosineDistance(resources.embedding, vec)` in an `ORDER BY ... LIMIT 1` for near-dup and a `WHERE` for the filter — `drizzle-orm` already exports it. No pgvector client, no similarity library.

**Cheap-then-paid staging, driven by native text.**
`curateScan` walks the work-list through six stages, each a pure decision over the row plus one thin seam call where a stage touches the network:
1. **Hash dedupe** — `contentHash = sha256(normalize(title + "\n" + snippet))` via `Bun.CryptoHasher`; `normalize` trims, lowercases, collapses whitespace. Drop if the hash matches a stored Resource or one already processed this Scan (a `Set` of hashes seen). Persist `content_hash`.
2. **Embed** — skip if the Resource already has an `embedding` (global reuse); else `embed({ model: embedModel(), value: title + snippet })`, store `embedding` + `embedding_model`.
3. **Embedding dedupe** — nearest stored Resource by cosine distance (the query excludes the Resource itself, so a just-embedded row can't match at distance 0); drop if within `NEAR_DUPLICATE_DISTANCE`.
4. **Embed-filter** — cosine similarity to the topic-context embedding (embedded once per Scan from `topicScanContext`, falling back to the topic `name` when empty); drop below `RELEVANCE_THRESHOLD`. **This is the last free stage; everything after it is metered.**
5. **Fetch** — Firecrawl → `content`; on failure fall back to `snippet` (never title).
6. **Score** — cheap-tier score, then premium-tier re-score + why-summary for promotions; upsert the Finding.

Thresholds (`NEAR_DUPLICATE_DISTANCE`, `RELEVANCE_THRESHOLD`, `PROMOTION_THRESHOLD`) and the budget are constants at the top of `curation.ts`, per adapter-authoring's "limits as top-of-file constants," tuned once real scans are observed.

**Embedding model: a 768-dim model behind LiteLLM `embed-model`.**
The vector column is fixed at 768, so the model must emit 768 dimensions. Proposed: `nomic-ai/nomic-embed-text-v1.5` on Fireworks (native 768, same provider as the chat tiers). `worker/llm.ts` gains `embedModel()` beside `cheapModel()`, same fail-fast env check. Alternative — a 1536-dim model (OpenAI `text-embedding-3-small`) — would require changing the schema's vector dimension and a migration; rejected to keep the column stable. `embedding_model` records the choice so a later swap is a backfill. **The one hard constraint: whatever `embed-model` maps to must produce 768-dim vectors** (nomic supports Matryoshka truncation to 768 if a variant differs).

**Tiered scoring: cheap-model first pass, premium `score-model` promotion.**
Every fetched survivor is scored by `cheapModel()` (MiniMax M3, already the "app cheap tier") via AI SDK structured output (`Output.object`, Zod `{ score: number }`) — a content-aware second filter. Survivors at/above `PROMOTION_THRESHOLD` are re-scored by a new premium `score-model` that returns `{ score, why }`; that score and why-summary become the Finding. Two tiers keep premium volume — the expensive tier — proportional to genuinely promising media, not to everything that passed the vector gate. The premium backend model is a `litellm-config.yaml` `model_name` mapping, so choosing/tuning it is config, not code; start with a stronger Fireworks model and revisit on eval. `scoreModel()` joins `llm.ts`. `ponytail: two tiers; collapse to one if evals show the cheap pass adds no separation, or add a third only if a tier is measurably mis-sized.`

**Which Resources curation processes, and idempotency.**
After upsert, curation loads the Scan's discovered Resources (by the found URLs) that lack a Finding for this Topic — an anti-join against `findings` on `(topic_id, resource_id)`. Already-scored Resources are skipped, so a re-scan does not re-pay for them; spend-cap survivors carried from a prior Scan are simply still Finding-less, so they are picked up next time. Findings upsert on the `(topic_id, resource_id)` unique constraint, so any future re-score updates in place. Embedding reuse (stage 2) and Finding-absence scoping together bound cross-Scan rework.

**Per-Scan spend cap and per-stage cost: a best-effort dollar tally.**
A running `spent` tally accumulates each stage's estimated dollars. Before each **paid** unit (a fetch, a premium score), curation checks `spent >= CURATION_SCAN_BUDGET_USD`; once true it stops initiating paid work and leaves the rest Finding-less. Cheap stages (embed, filter) are never gated. Dollar estimates are best-effort: LLM cost ≈ `usage.totalTokens × price[model]` from the AI SDK response; fetch cost ≈ a per-page Firecrawl constant. These feed both the cap and `stage_costs` (`{ embedding, fetch, scoringCheap, scoringPremium }`), with `scans.cost` the sum over ingestion + every stage. This matches the established "app cost is best-effort; LiteLLM meters authoritative spend" rule. `ponytail: estimate cost from token usage × a price map; swap to LiteLLM's /spend read-back only if the estimate drifts enough to mis-fire the cap.`

**Failure isolation mirrors ingestion.**
A seam that cannot initialize — `embedModel()`/`scoreModel()` with unset proxy env — throws and fails the whole Scan, fail-fast like `cheapModel()` today (a systemic misconfig should be loud, not a silent empty Feed). A transient per-Resource error inside a stage (one fetch 500, one score timeout) is caught, logged, and that Resource is skipped, degrading only its contribution — the same "one failure never aborts the batch" rule adapters follow. `ai_summary` is one final `cheapModel()` recap over the Scan's tallies and top why-summaries (the schema wants it "llm-written"); `ponytail: one cheap recap call, template it instead if that call's cost ever matters.`

## Risks / Trade-offs

- **Embedding dimension mismatch** → if `embed-model` is pointed at a non-768 model, every insert into `resources.embedding` fails. Mitigation: the model choice is pinned to 768 in `litellm-config.yaml` and called out in the migration/smoke steps; the live smoke asserts a stored vector's length is 768 before the pipeline is trusted.
- **Exact vector scan on a growing table** → near-dup and filter do a sequential cosine scan over stored embeddings; fine at MVP volume, linear as `resources` grows. Mitigation: add an HNSW index on `resources.embedding` (one migration) when row counts warrant; the query shape (`ORDER BY embedding <=> vec`) already matches what the index accelerates. `ponytail: no index yet; add HNSW when a scan's dedupe query gets slow.`
- **Best-effort cost can mis-fire the cap** → token×price estimates drift from LiteLLM's real meter, so the cap may stop slightly early or late. Mitigation: acceptable for a soft ceiling (the goal is bounding, not billing); LiteLLM key budgets are the hard backstop at launch. Estimates are logged for calibration.
- **Hostile page content (fetched `content` is data, not instructions)** → scoring reads attacker-controlled page text into an LLM. It stays a Tier-1 "no hands" call — content in, `{ score, why }` out, no tools — so the worst a malicious page does is inflate its own score/why-summary, blast radius "one bad Finding," bounded by the input cap. Same threat model as a hostile topic `context`.
- **Everything fails the same way (proxy down)** → if the embedding proxy is unreachable, `embedModel()` throws on the first Resource and the Scan is marked `failed` (not a silent 0-Finding success) — the intended fail-fast. A per-call transient still isolates to one Resource.
- **Thin content on snippet fallback** → a fetch failure scores against the native snippet, which is shorter and weaker than full content. Accepted: a snippet-scored Finding beats no Finding, and the snippet already passed the relevance gate. The degraded basis is not currently recorded on the Finding; add a flag if it proves worth surfacing.
- **Re-scan cost creep** → without the Finding-absence scoping and embedding reuse, every scan would re-pay for every known Resource. Those two rules keep steady-state cost proportional to genuinely new media; the risk is a topic whose Sources churn URLs for identical content, which the content-hash dedupe absorbs.

## Migration Plan

1. **Schema.** In `db/schema.ts`: add `resources.snippet` (`text`, nullable), `resources.content` (`text`, nullable), and `scans.stage_costs` (`jsonb`, `$type<Record<string, number>>()`, `not null default {}`). `bun run db:generate` writes an additive migration (`0003_*.sql` — new nullable columns + a jsonb default, no data loss); `doppler run -- bun run db:migrate` applies it (owner-run, needs `DATABASE_URL`).
2. **Config.** Add `embed-model` (768-dim embedding, `mode: embedding`) and `score-model` (premium chat tier) to `litellm-config.yaml`, plus `litellm_settings.drop_params: true` so Fireworks embeddings accept the request (the AI SDK sends `encoding_format`, which Fireworks rejects — caught by the live smoke). `FIRECRAWL_API_KEY` is already in `.env.example`; add a documented `CURATION_SCAN_BUDGET_USD` default (constant in code, env-overridable).
3. **Seams.** Extend `worker/llm.ts` with `embedModel()` and `scoreModel()` (same fail-fast env guard). Add `worker/firecrawl.ts` (`fetchContent(url)` via raw `fetch`, timeout-bounded, returns content or throws).
4. **Adapters.** Populate `snippet` in each adapter from its native field (RSS description/summary, YouTube description, Reddit selftext, Exa highlights — add `highlights` to the Exa request). Leave `content` unset. Update each adapter's `.test.ts` where it asserts the emitted Resource shape.
5. **Curation.** Add `worker/curation.ts` (`curateScan` + pure helpers: `contentHash`/`normalize`, threshold predicates, the cost tally, score prompts) and `worker/curation.test.ts` (offline: hashing + normalization, near-dup/relevance/promotion threshold decisions, cap-halts-paid-work tally, `stage_costs` summation, prompt building). Wire `runTopicScan` to call `curateScan` after upsert and fold its counts/costs into the single Scan close.
6. **Gate.** `bunx biome check . && bunx tsc -b && bun test` — all pure decisions run offline.
7. **Live smoke** (owner-run under `doppler run`, proxy + Firecrawl + `DATABASE_URL` configured): scan a Topic with real context; confirm a stored `embedding` has length 768, that a below-threshold Resource gets no Finding and no fetch or scoring spend (its embedding still runs, before the gate), that a relevant Resource yields a Finding with a non-empty `why_summary`, and that `stage_costs` sums to `cost`. Covers the embed/fetch/score paths the offline gate cannot.

Rollback: revert the files, drop `embed-model`/`score-model` from `litellm-config.yaml`, and (if migrated) drop the three new columns. Nothing else reads them; ingestion is unchanged and keeps working with curation removed.

## Open Questions

- **Threshold and budget defaults** (`NEAR_DUPLICATE_DISTANCE`, `RELEVANCE_THRESHOLD`, `PROMOTION_THRESHOLD`, `CURATION_SCAN_BUDGET_USD`) — seeded from judgment, tuned once real scans and cost-per-scan are observed. Not blockers; they are top-of-file constants.
- **Premium `score-model` backend** — which model gives the best relevance-per-dollar for the second tier is an eval question, resolved by a `litellm-config.yaml` mapping, not code.
- **Whether snippet-fallback scoring should be flagged on the Finding** — deferred until it is clear the degraded basis matters to the Feed or to re-scan logic.
- **`ai_summary` shape** — a plain recap for MVP; if the Feed later wants structured scan metadata, revisit the prompt (a curation-era decision, not this change's).

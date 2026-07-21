## Why

The product's differentiator is scoring media against *your* context ([Roadmap & Tech Stack](https://app.notion.com/p/39262400378d81bcb64febe02343b3db)). Today a Scan stops at ingestion: `runTopicScan` upserts URL-deduped Resources and deliberately leaves `content_hash`, `embedding`, `kept_count`, `filtered_count`, `ai_summary`, and every Finding empty — the source-ingestion spec states outright that "those belong to curation." So nothing is scored and every Topic's Feed is empty. This change is curation: the second half of a Scan that turns raw Resources into topic-scoped Findings, cheaply, without spending an LLM call on media that was never relevant.

## What Changes

- Add a **`curation`** capability — a staged pipeline (`worker/curation.ts`) that runs after ingestion **within the same Scan**, before the Scan closes. Cheap stages run on adapter-native text (no fetch); the one paid content-fetch and the LLM scoring run only on what survives the cheap gate.
  1. **Hash dedupe** — SHA-256 of normalized title + native snippet; a Resource whose content hash already exists globally is dropped as a content-level duplicate (distinct from the URL dedupe ingestion already does).
  2. **Embed** — embed title + native snippet with a LiteLLM-routed embedding model (768-dim, matching the schema); store the vector and its `embedding_model` on the Resource.
  3. **Embedding dedupe** — pgvector cosine near-duplicate check against already-stored Resource embeddings; near-dups are dropped.
  4. **Embed-filter against topic context** — cosine of each survivor's embedding against the topic's **effective context** embedding (`topicScanContext`); Resources below the relevance threshold are filtered out. This is the cheap gate that runs *before* any paid stage.
  5. **Fetch** — Firecrawl-fetch full page content for embed-filter survivors into `resources.content`; on fetch failure, fall back to the native snippet (never the bare title).
  6. **Tiered LLM scoring + why-summaries** — a cheap-tier model first-pass scores the survivors; those above the promotion threshold are re-scored by a premium-tier model that also writes the one-line `why_summary`. Both tiers route through LiteLLM. Each survivor becomes a **Finding** (`signal_score`, `why_summary`, `scan_id`), upserted per `(topic, resource)`.
- **Adapters emit native snippet** (source-ingestion modification): each adapter populates a new `resources.snippet` from the text its API already returns — RSS `description`, YouTube `description`, Reddit `selftext`, Exa `highlights` — so the cheap stages have real text with no extra fetch. Adapters still emit no Findings, scores, or embeddings.
- **Spend caps** — a per-Scan USD ceiling, checked before each paid stage (fetch, premium scoring). Once the Scan's spend crosses the ceiling, remaining Resources are left unscored and carried to the next Scan rather than failing the Scan. The cap never truncates the cheap embed/filter stages.
- **`Scan.cost` recorded per stage** — a new `scans.stage_costs` jsonb records the dollar cost of each stage (embedding, fetch, cheap scoring, premium scoring); the existing `scans.cost` stays the total. On close, curation also writes `kept_count`, `filtered_count`, and an `ai_summary` recap.
- **New schema columns** — `resources.snippet` (native text) and `resources.content` (fetched full content), both nullable and pipeline-filled; `scans.stage_costs` jsonb.
- **LiteLLM tiers** — add an `embed-model` (768-dim) and a premium `score-model` to `litellm-config.yaml`; `cheap-model` stays the first-pass scoring tier. `worker/llm.ts` gains `embedModel()` and `scoreModel()` beside the existing `cheapModel()`.

## Capabilities

### New Capabilities
- `curation`: the post-ingestion pipeline that turns a Scan's raw Resources into Findings — hash + embedding dedupe, embed-filter against topic context, Firecrawl content fetch for survivors, tiered LLM scoring with why-summaries, per-Scan spend caps, and per-stage cost accounting. Owns Finding creation, the embed/score/fetch seams, and the pipeline's failure isolation.

### Modified Capabilities
- `domain-schema`: `resources` gains `snippet` (adapter-native text) and `content` (fetched full content), both nullable and pipeline-filled; `scans` gains `stage_costs` (per-stage dollar breakdown), with `cost` remaining the total.
- `source-ingestion`: every adapter SHALL populate the Resource's `snippet` from its own API's native text (RSS description, YouTube description, Reddit selftext, Exa highlights). Adapters still emit no Findings/scores/embeddings and `content` stays unset at ingestion.

## Impact

- **Schema:** two `resources` columns + one `scans` column, one generated migration. Additive (new nullable columns / jsonb default), no data loss.
- **Dependencies:** **none added.** Firecrawl is called via raw `fetch` (mirroring the Exa adapter's pattern), embeddings via the AI SDK's `embed`/`embedMany` over the existing `@ai-sdk/openai` provider, and pgvector similarity via Drizzle's `cosineDistance` — all already present.
- **Config:** `litellm-config.yaml` gains `embed-model` and `score-model`; `FIRECRAWL_API_KEY` is already staged in `.env.example`; a per-Scan spend-cap default (constant, env-overridable).
- **Code:** new `worker/curation.ts` (+ `.test.ts`) and `worker/scrape.ts`; edits to `worker/scan.ts` (run curation before closing the Scan), `worker/llm.ts` (`embedModel`/`scoreModel`), the four adapters (native snippet), and `db/schema.ts`.
- **Deferred:** OCR/vision for image-only pages; re-embedding backfill when the embedding model changes (the raw `content` is retained so it is a backfill, not a schema change); cross-topic reuse of an existing Finding's score; LiteLLM per-virtual-key budgets (infra-level spend control that complements the app-level per-Scan cap, lands with per-user keys at launch).

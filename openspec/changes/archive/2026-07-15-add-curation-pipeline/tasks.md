## 1. Schema and config

- [x] 1.1 In `db/schema.ts`: add `resources.snippet` (`text`, nullable) and `resources.content` (`text`, nullable), both pipeline-filled; add `scans.stageCosts` (`jsonb("stage_costs").$type<Record<string, number>>().notNull().default({})`). Comment every group per code-style
- [x] 1.2 `bun run db:generate` to write the additive migration (`0003_adorable_shiva.sql` — two nullable `resources` columns + a `scans.stage_costs` jsonb default, no data loss); applying it with `doppler run -- bun run db:migrate` is owner-run (needs `DATABASE_URL`) and stays pending
- [x] 1.3 Add to `litellm-config.yaml`: an `embed-model` entry (`mode: embedding`, `nomic-ai/nomic-embed-text-v1.5`, `output_vector_size: 768` — MUST equal the schema's 768) and a premium `score-model` chat entry (`kimi-k2p7`, tunable on eval)
- [x] 1.4 Confirmed no `.env.example` edit needed (`FIRECRAWL_API_KEY` already present); `CURATION_SCAN_BUDGET_USD` is a top-of-file constant in `curation.ts` (env-overridable); no new script, so no README change

## 2. LLM and fetch seams

- [x] 2.1 Extended `worker/llm.ts` with `embedModel(): EmbeddingModel` returning `proxy().textEmbeddingModel("embed-model")`, reusing the existing fail-fast `LITELLM_BASE_URL`/`LITELLM_MASTER_KEY` guard (refactored into a shared `proxy()` builder)
- [x] 2.2 Extended `worker/llm.ts` with `scoreModel(): LanguageModel` returning `proxy().chat("score-model")` behind the same guard, beside `cheapModel()`
- [x] 2.3 Created `worker/firecrawl.ts`: `fetchContent(url): Promise<string>` via raw `fetch` to the Firecrawl scrape endpoint with `FIRECRAWL_API_KEY`, bounded by `AbortSignal.timeout`, returning the page markdown or throwing on a missing key / non-ok response (mirrors the Exa call in `search.ts`); no SDK dependency

## 3. Adapters emit native snippet (source-ingestion)

- [x] 3.1 `worker/adapters/feed.ts` (the shared RSS/Atom path for rss + youtube-atom + reddit-rss): populate `snippet` from the entry description (`contentSnippet`/`content`/`summary`); leave `content` unset; removed the now-redundant per-entry `hashContent` (curation owns uniform hashing); updated `rss.test.ts`
- [x] 3.2 `worker/adapters/youtube.ts`: populate `snippet` from the video description in the Data API path (the Atom path flows through `feed.ts`); leave `content` unset; updated `youtube.test.ts`
- [x] 3.3 `worker/adapters/reddit.ts`: populate `snippet` from the post selftext in the OAuth path (the RSS fallback flows through `feed.ts`); leave `content` unset; updated `reddit.test.ts`
- [x] 3.4 `worker/adapters/search.ts`: request `contents.highlights` from Exa and populate `snippet` from each result's highlights in `parseResults`; leave `content` unset; updated `search.test.ts`
- [x] 3.5 Verified no adapter copies the title into `snippet` — a missing native text leaves `snippet` null (`|| null`), asserted in each adapter test

## 4. Curation pipeline

- [x] 4.1 Created `worker/curation.ts` with top-of-file constants: `NEAR_DUP_DISTANCE`, `RELEVANCE_THRESHOLD`, `PROMOTION_THRESHOLD`, `CURATION_SCAN_BUDGET_USD` (env-overridable), the per-tier price constants for cost estimation, and `FIRECRAWL_COST_PER_FETCH` (`NEAR_DUPLICATE_DISTANCE` names the near-dup threshold)
- [x] 4.2 Added pure helpers: `normalizeText` (trim, lowercase, collapse whitespace) and `contentHash` (`Bun.CryptoHasher("sha256")` over the normalized join); the `isNearDuplicate`/`isRelevant`/`isPromoted`/`canSpend` predicates; and `charge` / `tokenCost` for the per-stage cost accumulator
- [x] 4.3 Added the work-list query (`loadUnscored`): the Scan's discovered Resources (by found URL) that lack a Finding for the Topic (anti-join via `notInArray` on `findings`); already-scored Resources are skipped
- [x] 4.4 Implemented the cheap stages per Resource (`runStages`): hash dedupe (against stored hashes and a per-Scan `Set`, persist `content_hash`), embed via `embedModel()` skipping already-embedded Resources, embedding dedupe via Drizzle `cosineDistance` nearest-neighbor, and the embed-filter against the once-per-Scan topic-context embedding (`loadContext`, name fallback when empty)
- [x] 4.5 Implemented the paid stages for embed-filter survivors, gated by the spend cap (`canSpend` — defers the whole Resource atomically once over the ceiling): Firecrawl `fetchContent` → `content` with snippet fallback (never title) on failure, then cheap-tier score, then premium `scoreModel()` re-score + why-summary for promotions; upsert the Finding on `(topic_id, resource_id)`
- [x] 4.6 Wrapped per-Resource work in `curateResource`'s try/catch so one Resource's transient error is logged and skipped; a seam init failure (unset proxy env) propagates from `loadContext` before the loop and fails the Scan
- [x] 4.7 `curateScan` returns the summary: `keptCount` (Findings written), `filteredCount` (dropped by hash/embedding dedupe or embed-filter), `stageCosts`, curation `cost`, and an `ai_summary` from one final `cheapModel()` recap over the tallies and top why-summaries
- [x] 4.8 Created `worker/curation.test.ts` (offline): `normalizeText`/`contentHash` stability and collision, the three threshold predicates, the spend-cap tally halting paid work at the ceiling, and the score/summary prompt builders — the embed/fetch/score/DB wrappers are left to the live smoke

## 5. Wire curation into the Scan

- [x] 5.1 Edited `worker/scan.ts`: after the Resource upsert and before the Scan close, call `curateScan(scan, summary.resources)`; folded its `keptCount`, `filteredCount`, `stageCosts`, `aiSummary`, and curation `cost` (added to ingestion `cost`) into the single `scans` update; a curation throw hits the existing `catch` that finalizes the Scan `failed`
- [x] 5.2 No change to `worker/scan.test.ts` — it exercises only the pure `toScanSummary` aggregation (unchanged); the close is exercised by the live smoke

## 6. Verify

- [x] 6.1 Ran the gate: `bunx biome check . && bunx tsc -b && bun test` — green (30 tests pass; every pure decision runs offline)
- [x] 6.2 Live smoke — **owner-run manual gate, PASSED (7/7 assertions)** against the dev LiteLLM proxy + Firecrawl under `doppler run`: a scan of a real Topic stored 768-dim `embedding`s, produced Findings with non-empty `why_summary`s, and `stage_costs` summed to `cost`. Surfaced one required config fix — `litellm_settings.drop_params: true` (Fireworks embeddings reject the `encoding_format` the AI SDK sends), now in `litellm-config.yaml`

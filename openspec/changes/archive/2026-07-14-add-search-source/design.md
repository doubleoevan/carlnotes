## Context

`source-ingestion` ships the seam: `SourceAdapter = (source: Source) => Promise<AdapterResult>`, a `Partial<Record<kind, SourceAdapter>>` registry, `runTopicScan` with per-Source failure isolation and cost summation, and global upsert deduped on `resources.url`. Three adapters exist (`rss`, `reddit`, `youtube`), all keyless-or-keyed feed pullers that emit `cost: 0`. The `source_kind` enum already lists `search`; a Source of that kind hits the registry miss and is skipped.

The search Source is a different animal. RSS/Reddit/YouTube pull from a URL the user named; search **scouts** — it reads the topic's context doc, asks an LLM for fresh queries, and runs them through Exa for open-ended discovery (Notion "Free search is a first-class source"; Exa chosen over Tavily for semantic discovery, revisitable). It is also the first LLM call in the repo, so it establishes the app's model seam: Vercel AI SDK + Zod structured outputs, routed through the LiteLLM proxy (the declared stack — LiteLLM from launch for per-user budgets and bill protection).

Constraints: Bun runtime; `worker` may import `db`; the LiteLLM proxy and `litellm-config.yaml` exist from Day 0; `EXA_API_KEY` is already in `.env.example`; tests are structural/offline (no live network), matching `rss.test.ts`/`reddit.test.ts`; `integration_id` stays null for MVP (deployment-level keys, not per-user grants).

## Goals / Non-Goals

**Goals:**
- `searchAdapter` on the existing `SourceAdapter` interface: context doc → LLM queries → Exa → `read` Resources, deduped by canonical URL, with the real dollar cost recorded on the Scan.
- Establish the app LLM seam (`worker/llm.ts`): one configured AI-SDK model pointed at LiteLLM, reused by later curation stages — not a per-call inline client.
- Idempotency: re-scanning emits the same canonical URLs (Exa's result URL), so the global upsert dedupes and existing embeddings survive.
- Failure isolation preserved: a missing key, an unreachable proxy, or an Exa error degrades only this Source.

**Non-Goals:**
- **Domain promotion** (domains that repeatedly earn thumbs-up get promoted to registered RSS/config/code sources). It needs Findings + thumbs history, neither built yet. The scout ships now; the ladder that gives proven scouts permanent posts is later work.
- Per-user LiteLLM virtual keys and per-scan budgets — launch-week bill protection; MVP authenticates to the proxy with the master key.
- Precise LLM-token cost on the Scan — LiteLLM meters proxy spend per key; the adapter reports Exa's cost only for MVP (see Decisions).
- Full-content fetch — Exa returns URL + title; fetching and hashing bodies (Firecrawl) belongs to curation. Resources emit with `contentHash: null`, like the other adapters.
- Retry/backoff and Exa `type`/category/date tuning — deferred until evals or limits ask for them.

## Decisions

**The search adapter reads its own topic's context doc; the `SourceAdapter` signature is unchanged.**
`searchAdapter` does `db.select().from(topics).where(eq(topics.id, source.topicId))` to read `context_doc` (and `name` for the empty-doc fallback). The alternative — widen the interface to `(source, topicContext) => …` and have `runTopicScan` fetch and pass it — ripples to all three existing adapters, the registry type, `scan.ts`, and the "Shared adapter interface" spec requirement, all to serve one consumer. Search is the only inherently topic-aware adapter (the scout must read the topic to scout), so it reads the topic itself. `worker` importing `db` is boundary-legal (`scan.ts` already does); this is a localized, documented deviation from the "adapters are pure per-Source fetchers" habit, mirroring how Reddit/YouTube documented reading keys from env instead of an Integration. If a second context-aware adapter appears, promote to the wider signature then — not speculatively now.

**Query generation: AI SDK structured output + Zod, routed through LiteLLM — over raw `fetch` + JSON mode.**
`generateText({ model, output: Output.object({ schema: z.object({ queries: z.array(z.string()) }) }), prompt })` returns a validated, bounded query list (`generateObject` is deprecated in `ai@7` in favor of `generateText`'s `output` setting). The declared architecture is "AI SDK + Zod, structured outputs, routed through LiteLLM," and this is the first of many structured LLM calls (scoring, summaries, the research agent all follow) — so the seam is immediately reused, not speculative. Raw `fetch` to `/chat/completions` with JSON mode is ~20 lines and zero deps, but hand-rolls schema validation and bucks the stack every later stage will adopt. The model is built once in `worker/llm.ts` via `createOpenAI({ baseURL: LITELLM_BASE_URL, apiKey: LITELLM_MASTER_KEY })` (LiteLLM is OpenAI-compatible); `searchAdapter` imports the model, never constructs a client inline.

**Exa via raw `fetch` to its REST API — over `exa-js`.**
`POST https://api.exa.ai/search` with header `x-api-key: EXA_API_KEY`, body `{ query, numResults, type: "auto" }`. This matches exactly how `youtube.ts` calls googleapis and `reddit.ts` calls oauth.reddit.com — one endpoint, `fetch`, a timeout, an ok-check. `exa-js` would be a dependency for a single POST. Consistent with "buy the plumbing" only where the plumbing is nontrivial; a REST POST is not.

**Cost = Exa's reported dollar cost, summed across queries; LLM-token cost deferred.**
Exa returns `costDollars.total` per search response; the adapter sums it across queries and returns it as `AdapterResult.cost`, so `scans.cost` reflects paid discovery — the first non-zero adapter cost. LLM-token cost is *not* converted to dollars here: it needs a per-model price map, and LiteLLM already meters proxy spend per key (the bill-protection layer). Attributing LLM dollars onto the Scan is a cross-cutting concern the curation change (which makes far more LLM calls) should own once, not something this adapter hand-estimates. `ponytail:` Exa cost only for MVP — add LLM-token dollars when curation builds cost accounting.

**No keyless mode, no `fallbackMode`.**
Search is inherently keyed: Exa needs `EXA_API_KEY`, query-gen needs the proxy. There is no free variant to degrade to, so `searchAdapter` never sets `fallbackMode`. A missing `EXA_API_KEY` (or an unreachable proxy / Exa error) throws, and `runTopicScan` isolates it as a failed Source — the Scan still succeeds if any other Source ran, and fails only if search was the sole Source. This is consistent with the interface ("omit `fallbackMode` when it has no fallback") and the "keyless first" principle simply does not apply to a Source that cannot exist keyless.

**`read` Resources; empty context doc falls back to the topic name.**
Exa returns web pages/articles → `kind: "read"`, canonical URL = the result `url`, deduped across queries in a `Map` (like `parseVideos`/`parsePosts`), `contentHash`/`embedding` left null. `topics.context_doc` defaults to `""`; an empty doc means the LLM has nothing to scout from, so the prompt falls back to the topic `name`. If the LLM still returns zero queries, no Exa call runs and the Source contributes zero Resources at ~zero cost — an empty result, not a failure.

**Config knobs are top-of-file constants; per-Source overrides deferred.**
Top-of-file `MAX_QUERIES` and `RESULTS_PER_QUERY` (and `FETCH_TIMEOUT_MS`, per adapter-authoring); the search Source needs no config — the context doc is its input. Per-Source overrides (`source.config.numQueries` / `resultsPerQuery`) are deferred until a consumer needs them (YAGNI) — nothing sets them today, so constants keep the adapter simpler.

**Testing: one pure parser offline, live calls are thin wrappers.**
`parseResults(response): { resources, cost }` is pure — fixture search JSON (Exa's shape) → deduped `read` Resources with canonical URLs plus the summed `costDollars`; the test asserts URL, `kind: "read"`, within-payload dedupe, and cost. `buildQueryPrompt(contextDoc, name)` is pure and can assert the name fallback. `generateText`'s structured output and the Exa `fetch` are thin live wrappers `tsc -b` type-checks and no test exercises over the network, matching the established offline-test decision.

## Risks / Trade-offs

- **Hostile context doc (user text is data, not instructions)** → query-gen is a Tier-1 "no hands" call: content in, Zod-validated string list out, no tool loop. The worst a malicious doc does is steer *which* queries run — blast radius "searched the web," exactly the Notion security model. Structural: schema-locked output + the bounded `MAX_QUERIES` cap.
- **LiteLLM proxy unreachable or Exa 4xx/5xx** → throws, degrading only this Source (existing isolation). A topic whose only Source is search then produces a `failed` Scan — correct, not a silent empty feed.
- **Exa cost has no per-Source budget cap** → `scans.cost` records actuals; hard caps are LiteLLM's job for LLM spend and a future Exa-budget guard for search spend. `MAX_QUERIES × RESULTS_PER_QUERY` bounds a single run's Exa calls today.
- **LLM returns zero or junk queries** → Zod rejects non-strings; zero queries yields zero Resources (not a failure). A bad-but-valid query just returns weak Exa results curation will score low.
- **Large context doc inflates query-gen tokens** → capped at `MAX_CONTEXT_CHARS` before prompting; topic-level context-doc size limits remain a planned upstream margin lever.
- **Reusing the cheap coding-tier model for app inference** → MVP adds a `cheap-model` entry to `litellm-config.yaml` (MiniMax M3) rather than overloading `aside-model`; a dedicated app tier is a one-line config change when scoring/summaries pick their models.

## Migration Plan

No schema change. Steps: `bun add ai @ai-sdk/openai zod`; add `LITELLM_BASE_URL` to `.env.example` (auth via existing `LITELLM_MASTER_KEY`); add a `cheap-model` entry to `litellm-config.yaml`; write `worker/llm.ts`, `worker/adapters/search.ts` (+ `.test.ts`); register `search` in `worker/adapters/index.ts`. Verification gate: `bunx biome check . && bunx tsc -b && bun test` — the `parseResults` test runs offline. A live smoke (real Exa + proxy) is manual under `doppler run` since tests never touch the network. Rollback: unregister `search`, revert the files, drop the three deps; nothing else reads them and no data migration occurred.

## Open Questions

- **Query-gen model tier.** MVP adds `cheap-model` (MiniMax M3). Revisit when scoring/summaries land and the app's model roster is chosen holistically.
- **`MAX_QUERIES` / `RESULTS_PER_QUERY` defaults.** Start at 5 × 10; tune against the eval set once P/R and cost-per-scan are measured.
- **Exa `type` and filters.** MVP uses `type: "auto"`; expose `type`/category/date-range in `source.config` when evals show niche topics need them (the decision-log "revisit when" for Exa).

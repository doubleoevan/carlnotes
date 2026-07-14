## Why

The `source_kind` enum provisions `search`, but no adapter stands behind it — a Source of kind `search` is silently skipped. Search is the product's differentiator: unlike RSS/Reddit/YouTube, which pull from a URL the user already named, the search Source **scouts** — nightly, an LLM reads the topic's context doc, writes fresh queries, and runs them through Exa for unconstrained discovery ([Roadmap & Tech Stack](https://app.notion.com/p/39262400378d81bcb64febe02343b3db), "Free search is a first-class source"). It is also the first LLM call in the codebase, so it lands the AI-SDK-through-LiteLLM seam every later curation stage reuses.

## What Changes

- Add **`searchAdapter`** (`worker/adapters/search.ts`) on the existing `SourceAdapter` interface. It is the one topic-aware adapter: it reads its topic's `context_doc` (via `source.topic_id`), generates queries from it with an LLM, runs each through Exa, and emits the results as `read` Resources deduped by canonical URL.
- **Generate queries with the AI SDK routed through LiteLLM**: `generateText` with `Output.object` + a Zod schema returns a bounded list of query strings from the context doc (falling back to the topic name when the context doc is empty). The model is the cheap tier, addressed through the LiteLLM proxy — establishing the app's LLM seam.
- **Search Exa per query** with `fetch` against its REST API (`x-api-key: EXA_API_KEY`), matching the raw-`fetch` pattern of the YouTube/Reddit keyed paths. Results across queries dedupe within the adapter by canonical URL.
- **Report real cost**: unlike the keyless adapters (`cost: 0`), `searchAdapter` returns the dollar cost Exa reports in its response (`costDollars.total`), summed across queries, so a Scan's `cost` reflects paid discovery.
- **Register** `search` in the adapter registry (one line).
- Add the LLM plumbing: `ai`, `@ai-sdk/openai`, and `zod` dependencies; a small `worker/llm.ts` that exports the LiteLLM-pointed model; `LITELLM_BASE_URL` in `.env.example` (`EXA_API_KEY` already present); a cheap app model entry in `litellm-config.yaml`.

## Capabilities

### New Capabilities
<!-- none: this extends the existing source-ingestion capability rather than adding a new one -->

### Modified Capabilities
- `source-ingestion`: adds the search adapter — the first adapter that reads its topic's context doc, calls an LLM (AI SDK via LiteLLM) to generate queries, searches Exa, and reports a non-zero cost. No existing requirement changes: the shared interface, dedupe, `found_count`/`cost`, failure isolation, and the RSS/Reddit/YouTube adapters are untouched (the interface already carries `cost`, previously always `0`).

## Impact

- **Dependencies:** adds `ai`, `@ai-sdk/openai`, `zod` (`bun install`) — the declared LLM stack, first used here and reused by the whole curation pipeline. Exa is called with `fetch` (no `exa-js`).
- **Schema:** none. `search` is already in `source_kind`; Resources, Scans, and cost columns already exist.
- **Code:** new `worker/adapters/search.ts` (+ `.test.ts`) and `worker/llm.ts`; one-line edit to `worker/adapters/index.ts` (register). No change to `adapter.ts`, `scan.ts`, or the other adapters.
- **Env / config:** `EXA_API_KEY` (already in `.env.example`) plus `LITELLM_BASE_URL` for the proxy; auth via the existing `LITELLM_MASTER_KEY` for MVP. A `cheap-model` entry added to `litellm-config.yaml`. `integration_id` stays null — these are deployment-level keys, not per-user grants (same deviation the Reddit/YouTube adapters already document). Requires the LiteLLM proxy running (Day-0 stack).
- **Deferred:** domain-promotion (thumbs-up domains → registered sources — needs Findings + thumbs, not yet built); per-user LiteLLM virtual keys and scan budgets (launch week); precise LLM-token cost accounting (LiteLLM meters proxy spend separately; the adapter reports Exa cost only for MVP); Firecrawl full-content fetch (Exa gives URL + title, curation fetches bodies later); retry/backoff and context-doc truncation guards.

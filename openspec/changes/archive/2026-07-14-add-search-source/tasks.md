## 1. Dependencies, env, and proxy config

- [x] 1.1 `bun add ai @ai-sdk/openai zod`
- [x] 1.2 Add `LITELLM_BASE_URL` to `.env.example` under the model-proxy section (e.g. `http://localhost:4000`); leave `EXA_API_KEY` as-is (already present)
- [x] 1.3 Add a `cheap-model` entry to `litellm-config.yaml` pointing at the cheap tier (MiniMax M3), with `supports_function_calling: true`

## 2. LLM seam

- [x] 2.1 Create `worker/llm.ts`: export a lazy `cheapModel()` that validates `LITELLM_BASE_URL`/`LITELLM_MASTER_KEY` (throws if unset, so a misconfigured Scan fails in isolation rather than silently defaulting to OpenAI) and returns `createOpenAI({ baseURL, apiKey }).chat("cheap-model")`; the reusable app-inference seam

## 3. Search adapter

- [x] 3.1 Create `worker/adapters/search.ts` with top-of-file constants: `MAX_QUERIES`, `RESULTS_PER_QUERY`, `MAX_CONTEXT_CHARS`, `FETCH_TIMEOUT_MS`, `EXA_ENDPOINT`
- [x] 3.2 Add `buildQueryPrompt(contextDoc, name): string` (pure): prompt the LLM to write queries from the context doc, falling back to `name` when the doc is empty, capped at `MAX_CONTEXT_CHARS`
- [x] 3.3 Add `generateQueries(contextDoc, name): Promise<string[]>`: `generateText` + `Output.object` with `cheapModel()` and a Zod schema (`{ queries: z.array(z.string()) }`); trim, drop blanks, dedupe, then bound to `MAX_QUERIES`
- [x] 3.4 Add `parseResults(response): { resources: NewResource[]; cost: number }` (pure): map each result to a `read` Resource keyed by its `url` (title set, `contentHash` null; skip results whose `url` is not a string), deduped within the payload, and sum `costDollars.total` (absent → 0)
- [x] 3.5 Add `runSearch(query): Promise<SearchResponse>`: `POST EXA_ENDPOINT` with `x-api-key: EXA_API_KEY`, body `{ query, numResults: RESULTS_PER_QUERY, type: "auto" }`, timeout + ok-check; throw when `EXA_API_KEY` is unset or the response is not ok
- [x] 3.6 Add `searchAdapter`: read the topic's `context_doc`/`name` via `db.select` on `source.topic_id`, `generateQueries`, `runSearch` each query, merge results through `parseResults` deduped across queries, return `{ resources, cost }` with `fallbackMode` unset
- [x] 3.7 Create `worker/adapters/search.test.ts`: drive `parseResults` with a fixture search response (assert canonical URL, `kind: "read"`, cross-result dedupe, summed cost) and `buildQueryPrompt` (assert the empty-doc name fallback)

## 4. Register

- [x] 4.1 In `worker/adapters/index.ts`, register `search: searchAdapter` and update the placeholder comment (`search` no longer absent)

## 5. Verify

- [x] 5.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test`
- [ ] 5.2 Live smoke — **manual gate (owner: repo maintainer); not a commit blocker** since `search` isn't wired into a running schedule yet. Run before relying on live scans: under `doppler run` with the proxy up, scan a topic with a `search` Source and confirm Resources land and the Scan records a non-zero cost. Validates the `generateText` ↔ LiteLLM ↔ Fireworks structured-output path the offline gate can't exercise.

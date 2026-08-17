## 1. Source kind and the default Source set

- [x] 1.1 Add `x` to `sourceKinds` and to `editableSourceKinds` in `shared/enums.ts`. `editableSourceKinds` both validates a saved Source payload and feeds the custom picker, which is where `x` belongs
- [x] 1.2 Add `defaultSourceKinds = ["search"]` to `shared/enums.ts` as the registry both the seeding site and the editor's default group read. `x` is not a member — it names one account, so it is picked rather than preselected
- [x] 1.3 Update the Source `kind` comment in `db/schema.ts` to name `x`, then generate the additive `source_kind` enum migration with the project's Drizzle command and confirm it alters the enum without touching rows
- [x] 1.4 Add the `x` case to `toSourceSummary` in `api/topic/topics.ts`, rendering the followed account as `@handle` the way a reddit Source renders `r/subreddit`

## 2. The X search prompt

- [x] 2.1 Wrote `worker/prompts/search-x.md` for the context-driven query generation, then **deleted it** along with `searchTweetsForTopic`: suggestion proposes accounts from the Topic's own words at no read cost, so a second paid mechanism for the same job had no caller. Git history holds it if a search-based suggester is ever wanted
- [x] 2.2 Write the body to ask for short keyword-and-operator X queries rather than sentence-shaped semantic ones, teaching `OR`, `-`, `from:`, and a `min_faves:` quality floor, and stating that retweet and recency filters are applied by the caller so the model must not write them
- [x] 2.3 Registered `search-x` in `FALLBACK_PROMPT_TEMPLATES` and confirmed `prompts:sync --candidate` picked it up, then unregistered it with the deletion. The candidate it created in Langfuse is inert and can be removed there

## 3. The X ingester

- [x] 3.1 Add `X_COST_PER_READ` (0.00015) and `X_COST_MINIMUM_PER_REQUEST` (0.00015) to `worker/budget.ts` beside the other best-effort rates, with a comment naming the provider's $0.15/1k basis
- [x] 3.2 Write `worker/ingest/x.ts` with its limits as top-of-file constants: `MAX_QUERIES` (5, bounding the suggestion search), `HANDLE_PATTERN`, `RECENCY_WINDOW_MS` (7 days), `RATE_LIMIT_RETRY_MS`, `FETCH_TIMEOUT_MS`, and the endpoint — every TwitterAPI.io-specific name confined to this file
- [x] 3.3 Read the handle with the exported `toSourceHandle`, which trims it, drops a leading `@`, and refuses anything X would not resolve, since it goes straight into a query operator. A Source without one throws and fails in isolation
- [x] 3.4 Issue exactly one request per Source for `from:<handle>` with the `x-api-key` header, `queryType: "Latest"`, and `-filter:retweets since_time:<now - 7d>` appended by the ingester; follow no cursor, so the read bound holds by construction
- [x] 3.5 Map each tweet to a Resource: url built as `https://x.com/<author.userName>/status/<id>`, `title` as `@<userName> on X`, `kind` `read`, `snippet` from the tweet text with `t.co` links stripped (null when nothing readable remains), `engagement` from `likeCount`, `contentHash` null, deduped by url
- [x] 3.6 Return the real cost: `max(returnedTweets, 1) × X_COST_PER_READ` per request, summed, and leave `fallbackMode` unset
- [x] 3.7 Export `readHandle`, which confirms an account through the provider's user lookup, so suggestion can check a proposed handle without the ingester's provider names leaking out of this file
- [x] 3.8 Run requests sequentially with one retry after a 5.5s pause on 429, since the provider's free tier allows one request every five seconds. Log what failed, and throw only when the key is missing or every request failed
- [x] 3.9 Register `x: xIngester` in the `sourceIngesters` map in `worker/ingest/index.ts`
- [x] 3.10 Write `worker/ingest/x.test.ts` over the pure parts: the handle guard, the tweet-to-Resource mapping (url, title, snippet, engagement), the `t.co` stripping, dedupe across responses, the query bounds, and the cost arithmetic including the empty-response minimum

## 4. One canonical URL for a tweet

- [x] 4.1 In `worker/ingest/normalize.ts`, fold `twitter.com` (with its `www.` and `mobile.` forms) to `x.com` before the rest of canonicalization, as a named host-alias map rather than an inline branch
- [x] 4.2 Add `x.com` to the case-insensitive path hosts — a handle ignores case and a status id is digits, so the whole path folds safely
- [x] 4.3 Extend `worker/ingest/normalize.test.ts`: `twitter.com/Sama/status/123` and `x.com/sama/status/123` canonicalize to one URL, canonicalizing an already-canonical tweet URL is idempotent, and the YouTube and Reddit cases still behave as before

## 5. Review skips the fetch for X Resources

- [x] 5.1 In `fetchResourceContent` in `worker/review/score.ts`, return the Resource's snippet for an `x.com` host before any reuse, revalidate, or Firecrawl path, charging no fetch cost, with the decision as the exported `isSnippetComplete` predicate the way `isContentStale` is exported
- [x] 5.2 Add the test beside the existing score tests: an X survivor scores from its snippet with no fetch charged, and a survivor on any other host still reuses, revalidates, or fetches as before

## 6. The topic editor's default group and the X handle picker

- [x] 6.1 Replace `WEB_SOURCE` in `ui/src/lib/utils.ts` with per-kind display copy keyed on `defaultSourceKinds`, plus the `isDefaultSourceKind` guard both the editor and the settings card ask instead of naming a kind inline
- [x] 6.2 Rework `TopicSourceEditor`'s default group to render one row per registry member — each removable when on and offered as a turn-on control when off — and keep the "keep at least one source" guard counting every default row
- [x] 6.3 Seed a new Topic in `EditTopicModal` from `defaultSourceKinds` instead of the inline `{ kind: "search", value: "" }`
- [x] 6.4 Update `TopicSettingsCard` to render the default Sources from the same registry and copy rather than the single web line, and give `x` an icon so its custom row is not a bare marker
- [x] 6.5 Offer `x` in the custom add picker with a `handle…` placeholder, and map its typed value to `{ handle }` in `toSourceConfig`, stripping a leading `@` the way the reddit branch strips `r/`
- [x] 6.6 Move `toSourceConfig` from `EditTopicModal` into `ui/src/lib/utils.ts` beside the source-kind types. It is a pure mapper with no React in it, and importing the modal pulls in `topicClient`, which touches `window` at module load and cannot be unit tested. Cover every kind's config key, so a handle stored under the wrong name fails loudly
- [x] 6.7 Verify in the browser preview: `Add topic` opens with the default group rendering from the registry, and removing a default row leaves the others on and offers it back as a turn-on control. The api dev server on port 3000 belongs to another worktree, whose newer code now fails this branch's feed contract outright, so the create path was verified by running the real `createTopic` handler instead and the picker contents by reading the registry directly

## 7. Configuration, docs, and the domain model

- [x] 7.1 Add `TWITTERAPI_IO_API_KEY` to `.env.example` with comments explaining the operator-level key, the $0.15/1k rate, and the one-request-per-Source bound. No query-cap variable — the ingester issues one request, so there is nothing to tune
- [x] 7.2 `TWITTERAPI_IO_API_KEY` was already set in the `dev` Doppler config and the owner has since set it in `prd`; `bun run smoke:x` confirmed it reaches the worker. The key is on the provider's **free tier**, one request every five seconds, which is what the retry pause is sized against
- [x] 7.3 Add `worker/x.smoke.ts` following `worker/search.smoke.ts`: read a real handle through the ingester and print its Resources and cost, then confirm the lookup keeps a real posting account while dropping one nobody holds and one that has never posted
- [x] 7.4 Register `smoke:x` in `package.json` (and in the `smoke` chain) and update the README Development section in the same change, per the repo rule
- [x] 7.5 Update `.agents/skills/domain-model/SKILL.md`: add `x` to the Source kind list, note that `search` is the default Source set and that `search` and `x` both authenticate with one operator-level key rather than an Integration, and note that `ingestion` now covers Exa and TwitterAPI.io
- [x] 7.6 Add TwitterAPI.io to the README's Stack line beside Exa and Firecrawl. The README carries no source-kind list, so the Stack line is the one place a new external provider belongs

## 8. X in source suggestions

- [x] 8.1 Export `readHandle` from `worker/ingest/x.ts`, confirming an account through the provider's user-lookup endpoint. Keep every provider name in that one file, throw `FeedStatusError` on a refused request so a rate limit reads as "not now", and read the **body** rather than the HTTP status, since the lookup answers 200 for a missing account
- [x] 8.2 Refuse an account that has never posted. A model-invented handle often lands on a real but dormant account, which would confirm and then return nothing on every Scan. The lookup already returns `statusesCount`, so this costs no extra call
- [x] 8.3 Add the `x` branch to `readSuggestedSource` in `worker/suggest.ts`, so a proposed handle is confirmed the way every other kind is
- [x] 8.4 Add the `x` branch to `toSourceKey`, keyed on the lowercased handle without its `@`, so a Topic already following an account is not offered it again
- [x] 8.5 Teach `worker/prompts/suggest-sources.md` to propose X accounts by handle, warning against aggregators and near-miss handles, and bump it to version 2
- [x] 8.6 Cover the new key in `worker/suggest.test.ts`

## 9. Verification

- [x] 9.1 Run the gate: `bunx biome check .`, `bunx tsc -b`, and `bun test` — all green, 403 tests passing after the merge with main
- [x] 9.2 `bun run smoke:x` passed against the real provider: 13 tweets read from `@OpenAI` under the 20-per-Source bound, each one a well-formed tweet url, cost $0.00195, which is exactly the per-read rate times what came back. The search half surfaced 26 distinct handles from 30 tweets
- [x] 9.3 Ran the ingest stage on a Topic with the default Source plus an X Source: each Source's cost charged into the Budget's `ingestion` bucket, which equalled the summed Source cost and stayed inside the $0.50 Scan ceiling
- [x] 9.4 Confirmed with `TWITTERAPI_IO_API_KEY` unset: the `x` Source reported `failed`, the `search` Source's Resources were kept, and the ingestion bucket held only Exa's spend
- [x] 9.5 Ran the real `suggestSources` flow end to end: it proposed `x simonw` for an AI-engineering Topic and the handle survived verification. Confirmed the verifier keeps a real posting account, drops one that has never posted, and drops a handle no account holds
- [x] 9.6 Merged `origin/main` and resolved twelve conflicts. Main renamed `IngestResult.cost` to `costDollars`, moved `toSourceSummary` into `shared/sources.ts`, moved `toSourceConfig` into `EditTopicFields`, moved `isContentStale` into `worker/scrape.ts`, and moved the sources display into `TopicInfo` — the `x` branches follow to each new home, and my duplicate `toSourceConfig` in `ui/src/lib/utils.ts` was dropped in favor of main's
- [x] 9.7 Regenerated the migration as `0044_far_cyclops` after main's `0033` took the number mine had claimed, and applied it — the dev database's `source_kind` now carries `x`
- [x] 9.8 Deleted `searchTweetsForTopic`, `buildXSearchPrompt`, `generateSearchQueries`, and `worker/prompts/search-x.md`, unregistering the prompt and dropping its checks from `scan.smoke.ts` and `x.test.ts`
- [x] 9.9 Gave `readHandle` the same 429 retry the search path had, by extracting the shared `requestProvider`. Without it, suggestion — which confirms its candidates at once — had every X handle rate-limited and kept **unverified** on the free tier. The smoke test caught this
- [x] 9.10 Merged `origin/main` a second time (account closing, email identity, owner photos) with no conflicts, and reran the gate
- [x] 9.11 Merged `origin/main` a third time (email identity, topic gating, SEO surfaces, TanStack Query feed). Three conflicts: the README Stack line took both sides, `TopicInfo` took main's recap imports beside the registry ones, and the migration journal took main's. Regenerated the migration a second time as `0046_noisy_steve_rogers`, since main had claimed both `0044` and `0045`

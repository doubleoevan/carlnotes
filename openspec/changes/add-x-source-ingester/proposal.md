## Why

X is where a topic's conversation happens first, and CarlNotes has no way to read it. The official X API has had no flat tier since February 2026, so reading it there means a metered enterprise contract plus per-user OAuth. TwitterAPI.io reads the same content at roughly 30x cheaper per read ($0.15 per 1,000 tweets), authenticates with one operator-level `x-api-key` header, and needs no OAuth — so X becomes a source we can switch on by default instead of one every user has to connect.

An `x` Source names one handle, the way a `reddit` Source names a subreddit. That keeps it a **custom** Source rather than a default one: reading a specific account is precise and cheap, and it does not put a metered Source on every new Topic. Ingestion spend tracking has already landed — a Scan carries one Budget with an `ingestion` bucket — so this ingester reports its real cost into that bucket rather than the zero the keyless ingesters return, and one request per Source bounds what a Scan can spend before the Budget is next consulted.

Choosing the handle is its own problem, and source suggestion already solves it: `suggestSources` reads a Topic's own words and proposes Sources, so it gains `x` alongside rss, reddit, and youtube — each proposed handle confirmed against the provider's account lookup before the user sees it, at no read cost.

## What Changes

- Add `x` to the Source kinds, backed by a new `xIngester` that reads one handle's recent tweets and emits one `read` Resource per tweet. The handle is required, taken with or without a leading `@`, and refused unless X would resolve it.
- Keyless for the app: one operator-level `TWITTERAPI_IO_API_KEY`, no Integration row and no per-user OAuth. A missing key fails that Source in isolation, exactly as a missing `EXA_API_KEY` fails the search Source.
- The ingester returns its **real** cost — reads × $0.00015, floored at TwitterAPI.io's per-request minimum — which charges into the Scan Budget's `ingestion` bucket. It is the second paid ingester after search.
- Bound one Scan's X spend structurally: one request per Source, no pagination cursor, so at the provider's twenty-per-response ceiling a Source reads at most twenty tweets, about $0.003. More coverage is more handles, each bounded on its own.
- Add `x` to source suggestion: the `suggest-sources` prompt proposes accounts by handle, and each is confirmed through the provider's account lookup, which drops an invented handle and also a real-but-dormant account that would never produce a Resource.
- Establish the **default Source set** as a shared registry rather than the UI's hardcoded web toggle. `search` is its member; `x` is added from the custom picker by handle.
- Canonicalize tweet URLs to one key: `twitter.com` folds to `x.com` and X paths fold case, so a tweet found by web search and the same tweet read from X dedupe to a single Resource.
- Skip the Firecrawl fetch for an X Resource during review. A tweet's text is already its whole content, and x.com blocks scraping, so today every surviving X Resource would buy a guaranteed-failing paid fetch before falling back to the snippet it already had.
- Keep the `domain-model` skill in sync: the Source kind list gains `x`, and the layering rules gain the default Source set.

## Capabilities

### New Capabilities

None. X ingestion extends the existing ingestion capability rather than introducing a new one.

### Modified Capabilities

- `source-ingestion`: adds the handle-based X ingester requirement (`read` Resources, engagement, snippet), X in source suggestion with its account-lookup check, the one-request-per-Source bound, the real cost into the `ingestion` bucket, the default Source set registry, the `x.com` canonical-URL rules, and the review-stage fetch skip for X Resources.
- `domain-schema`: the Source `kind` set gains `x`, whose `config` carries the handle it follows.
- `topic-editing`: the edit modal's default Source group becomes the registry's members rather than the single hardcoded web scout, and the custom add picker gains `x`, which takes a handle.

## Impact

- **Schema**: `source_kind` pgEnum gains `x` (one additive enum migration; no data backfill, no breaking read).
- **Shared**: `shared/enums.ts` — `sourceKinds` and `editableSourceKinds` gain `x`, and a new `defaultSourceKinds` registry holds `search`.
- **Worker**: new `worker/ingest/x.ts` + test, registered in `worker/ingest/index.ts`, exporting `readHandle` for suggestion to confirm a proposed account; `worker/suggest.ts` gains the `x` branches; `worker/prompts/suggest-sources.md` goes to version 2; `worker/ingest/normalize.ts` gains the `x.com` host alias and case folding; `worker/review/score.ts` skips the fetch for X Resources.
- **API**: `toSourceSummary` gains the `x` case, rendering `@handle`.
- **UI**: `TopicSourceEditor` and `EditTopicModal` seed and render the default group from the registry instead of `WEB_SOURCE`, and `x` joins the custom add picker with a handle input; `TopicSettingsCard` follows.
- **Config**: `TWITTERAPI_IO_API_KEY` in `.env.example`, Doppler, and the README.
- **Cost**: no new Topic carries a paid Source it did not ask for. An `x` Source costs one request per Scan, at most twenty reads, about $0.003 — see design.md for the arithmetic against the free plan's $3.00 monthly backstop.
- **No OAuth, no Integration rows, no new dependency** — the ingester is `fetch` against one REST endpoint.

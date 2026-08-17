## Why

Reddit shipped alongside YouTube in the early source work, so `redditIngester` exists but sits below the bar the RSS and YouTube ingesters set: it handles subreddit listings only (no search), its keyless path is the `.rss` feed, which drops the selftext snippet, the post score, and the configured sort, and its two modes are an either/or on credentials rather than a preference with a fallback. That last gap is the one that bites in production: the decision log entry *Reddit access* records that the keyless public endpoints need no approval but that Reddit blocks datacenter IP ranges, so the path a laptop proves works can return 403 from Northflank. Today a Reddit Source that is blocked returns nothing and a Scan reports it as a quiet week — the reader cannot tell a dead subreddit from a blocked one. And the set of Sources a new Topic starts with is a hard-coded `[{ kind: "search" }]` literal in the edit modal, with each kind's label and placeholder scattered across three more files, so which kinds are default is not declared anywhere a second surface can read.

## What Changes

- **Reddit search Sources.** `redditIngester` requires `config.subreddit` and reads that subreddit's listing; a `config.query` alongside it searches inside that subreddit instead. A Source naming no subreddit fails rather than reading something arbitrary. The site-wide search form of each URL is still built and tested, because searching Reddit at large is how a subreddit relevant to a Topic gets found — the seam the subreddit-suggestion work calls.
- **A keyless path that Reddit actually serves.** Reddit refuses its public `.json` endpoints with a 403 while still serving the rss feeds, so the fallback reads `r/<sub>/.rss`, `search.rss`, and `r/<sub>/search.rss` through the shared feed reader, and OAuth keeps the json path. The OAuth mode carries the selftext snippet, the post score, and the configured sort; the feeds carry the title, snippet, and canonical comments permalink but no score and the subreddit's default ordering — the loss the trace records under the existing `reddit-rss` mode.
- **OAuth preferred, the feeds as the fallback, blocked as an outcome.** With credentials set, the OAuth path runs first and a failure falls through to the feeds instead of failing the Source. Without credentials, only the feeds run. A Source that fails every mode fails with a reason naming what it asked for and how each mode refused it.
- **Reddit requests are spaced behind one queue.** A Scan runs its Sources at once, and Reddit refuses the second request that arrives with the first, so every request the ingester makes waits out its mode's gap behind the one before it — 30 seconds for the keyless feeds, which is what measurement showed they allow, and one second for OAuth, which has real headroom.
- **The Scan's per-Source trace covers failures.** `scans.fallback_sources` is renamed to `problem_sources` and its entries become a union: a Source that fell back records its mode, a Source that failed records its reason. A fallback still leaves the Scan `succeeded`.
- **The scan report names a failed Source's reason.** The per-Source block already prints kind and status; it gains the reason, so a blocked Source reads as blocked.
- **A default Source registry.** A shared per-kind registry declares each source kind's label, its config placeholder, and the ordered set preselected for a new Topic. `search` is preselected; `reddit` is a custom source the owner adds by naming a subreddit, since a preselected Source is created with no config and a Reddit Source is the subreddit it names. The edit modal, the topic page's Sources section, and the source picker read the registry instead of their own literals.
- **Source suggestion reads Reddit through the ingester.** `suggestSources` verified a suggested subreddit by rebuilding the keyless feed url and its own User-Agent. It now calls the ingester's reader, and resolves the written name through the ingester's own subreddit rule — so a name reddit would not accept is dropped before any request, instead of being fetched and possibly kept because a throttled host would not answer.
- **A deploy smoke for the live 403.** `bun run smoke:reddit` runs one Reddit Source through both modes and prints which answered and which was blocked, so the access question is settled from the deployed environment rather than a laptop.
- **The `domain-model` skill is resynced** with the default Source set and the `problem_sources` trace.

## Capabilities

### New Capabilities

None. The registry and the mode selection sit inside existing capabilities.

### Modified Capabilities

- `source-ingestion`: the Reddit ingester requirement gains search Sources, the JSON keyless path, OAuth-preferred mode selection with fall-through, and the failure reason; the trace requirement is rewritten around `problem_sources` covering fallbacks and failures; a new requirement covers the default Source registry.
- `curation`: the scan report grounds on each Source's failure reason, not only its fallback mode.
- `source-suggestion`: a subreddit candidate is read through the ingester's own reader and validated by its subreddit rule, and the requirement records why verification stays outside the ingester's request queue.
- `topic-editing`: the edit modal's default Source group and its add-a-source picker both read the registry rather than their own literals, and a new Topic starts with the registry's preselected set on.
- `topic-detail-page`: the Sources section leads with the default Source set rather than the single web scout line.

## Impact

- **Schema:** one rename migration, `scans.fallback_sources` → `problem_sources`, plus the widened entry type. No backfill — existing entries stay valid as the fallback arm of the union.
- **Worker:** `worker/ingest/reddit.ts` (+ tests), `worker/ingest/index.ts` (failure reason on the outcome and the trace), `worker/review/summarize.ts` (+ prompt data), `worker/workflows/run-topic-scan-activities.ts` (renamed field), new `worker/reddit.smoke.ts`.
- **Shared / UI / API:** new `shared/sources.ts` registry; `ui/src/components/topic/EditTopicModal.tsx`, `TopicSourceEditor.tsx`, `TopicSettingsCard.tsx`, and `ui/src/lib/utils.ts` read it instead of holding their own source literals.
- **Config:** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` already exist in `.env.example`; they move from optional-nicety to the deployed environment's preferred path in the Doppler config. No new dependency.
- **Docs:** README Development section gains `smoke:reddit`; the `domain-model` skill is updated in `.agents/skills/` and mirrored to `.claude/skills/`.
- **Not in scope:** an Integration-backed per-user Reddit grant (app-only credentials cover this), comment threads, and any Reddit write path.

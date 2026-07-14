## Why

`source-ingestion` shipped the shared `SourceAdapter` seam and one keyless adapter (`rss`), but the `source_kind` enum already provisions `reddit` and `youtube` with no adapters behind them — a Source of either kind is silently skipped. These are the two highest-value non-RSS Sources, and both have a keyed API (richer data) *and* a keyless public feed (the RSS/Atom the existing parser already reads). This change lands both adapters on the shared interface, keyed-first with a keyless fallback, and makes a degraded (keyless) Scan traceable so later curation can tell "no engagement signal" apart from "signal was there and low".

## What Changes

- Add **`redditAdapter`** (`worker/adapters/reddit.ts`): when `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` are set, fetch via the app-only OAuth API (client-credentials token → `/r/<subreddit>/<sort>` listing, so sort modes work); otherwise fall back to the keyless public subreddit `.rss` feed with a descriptive `User-Agent`. Both modes emit the comments permalink as the canonical URL, so switching modes never re-ingests the same post under a different URL.
- Add **`youtubeAdapter`** (`worker/adapters/youtube.ts`): when `YOUTUBE_API_KEY` is set, fetch recent videos via the Data API v3 uploads playlist; otherwise fall back to the keyless channel/playlist Atom feed. Both modes emit `https://www.youtube.com/watch?v=<id>` as the canonical URL, `kind: watch`.
- Extend the **adapter result contract** with an optional `fallbackMode` — set by an adapter only when it runs its keyless path (`reddit-rss`, `youtube-atom`), omitted otherwise.
- **Record the fallback mode on the Scan**: add a `scans.degraded_sources` column (jsonb, default `[]`) listing `{ sourceId, fallbackMode }` for every Source that fell back, threaded through `toScanSummary` and written by `runTopicScan`. A fallback is **not** a failure — the Scan still succeeds.
- **Register** `reddit` and `youtube` in the adapter registry (one line each).
- **Extract** the feed fetch+parse (`fetchFeed`, `parseFeed` parameterized by Resource `kind`) into `worker/adapters/feed.ts` so all three adapters share one keyless-feed path instead of reimplementing it.
- Add `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` to `.env.example` (`YOUTUBE_API_KEY` already present).

## Capabilities

### New Capabilities
<!-- none: this extends the existing source-ingestion capability rather than adding a new one -->

### Modified Capabilities
- `source-ingestion`: adds the Reddit and YouTube adapters (keyed API with a keyless feed fallback), extends the adapter result with an optional `fallbackMode`, and adds per-Source fallback-mode recording on the Scan. No existing requirement's behavior is removed — RSS, dedupe, `found_count`/`cost`, and failure isolation are unchanged.

## Impact

- **Dependencies:** none. Reddit OAuth and the YouTube Data API use `fetch`; both keyless fallbacks reuse the already-installed `rss-parser`.
- **Schema:** one additive column, `scans.degraded_sources jsonb NOT NULL DEFAULT '[]'` — a `bun run db:generate` migration, no backfill (default covers existing rows).
- **Code:** new `worker/adapters/reddit.ts`, `worker/adapters/youtube.ts`, `worker/adapters/feed.ts` (+ their `.test.ts`); edits to `worker/adapters/adapter.ts` (result type), `worker/adapters/rss.ts` (use `feed.ts`), `worker/adapters/index.ts` (register), `worker/scan.ts` + `.test.ts` (thread `fallbackMode` → `degraded_sources`), `db/schema.ts`, `.env.example`.
- **Env / config:** server-level credentials read from env (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `YOUTUBE_API_KEY`); `integration_id` stays null for MVP — a deliberate deviation from the adapter-authoring "credentials come from the Integration" rule, because these are one-per-deployment app keys, not per-user grants. Source `config` carries `subreddit`/`sort` (Reddit) and `channelId`/`playlistId` (YouTube).
- **Deferred:** persisting Reddit scores / comment counts and YouTube view counts (no home until Findings exist — curation change); per-user Reddit Integration credentials; OAuth token caching across Sources; Resource `kind` detection beyond the per-adapter constant; retry/backoff (a failed fetch still degrades only its Source).

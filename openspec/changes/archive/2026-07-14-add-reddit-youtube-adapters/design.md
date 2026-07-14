## Context

`source-ingestion` already ships the seam: `SourceAdapter = (source: Source) => Promise<{ resources, cost }>`, a `Partial<Record<kind, SourceAdapter>>` registry, `runTopicScan` with per-Source failure isolation, and global upsert deduped on `resources.url`. `rssAdapter` is the one keyless adapter; its `parseFeed(xml)` already turns RSS **and** Atom into deduped Resources via `rss-parser`. The `source_kind` enum lists `reddit` and `youtube`, so Sources of those kinds can already exist — they just hit the registry miss and get skipped.

Both new Sources have the same shape: a keyed API with richer data, and a keyless public feed that is *already parseable by `parseFeed`* (Reddit `.rss` is Atom; YouTube `videos.xml` is Atom). So the keyless fallback is nearly free — the work is the keyed path, the mode selection, and making a degraded Scan traceable.

Constraints: Bun runtime; `worker` may import `db`; tests are structural/offline (no live network, matching `rss.test.ts` and `schema.test.ts`); `integration_id` is null for MVP so credentials come from env, not a per-user Integration.

## Goals / Non-Goals

**Goals:**
- `redditAdapter` and `youtubeAdapter` on the existing `SourceAdapter` interface, keyed-first with a keyless feed fallback.
- The keyless fallback reuses one shared feed path, not a copy of `rssAdapter`'s fetch/parse.
- A degraded (keyless) Scan is traceable: which Sources fell back, and to which mode, recorded on the Scan.
- Cross-mode idempotency: the same post/video yields the same canonical URL whether the adapter ran keyed or keyless.

**Non-Goals:**
- Persisting Reddit scores / comment counts or YouTube view counts — no column exists and their home is a Finding, which curation owns. Sort selection and reliability are the keyed modes' MVP payoff; the raw metrics are dropped until Findings exist.
- Per-user Reddit Integration credentials and a shared credential resolver — env-level app keys only for MVP.
- OAuth token caching, retry/backoff, quota accounting — one fetch per Source per Scan is well under every limit.
- Resource `kind` detection beyond a per-adapter constant (`read` for Reddit, `watch` for YouTube).

## Decisions

**Keyed-first, keyless-fallback, selected from env — `integration_id` stays null.**
Each adapter resolves its mode once: Reddit uses OAuth iff `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set; YouTube uses the Data API iff `YOUTUBE_API_KEY` is set; otherwise the keyless feed. These are one-per-deployment *app* credentials, not per-user grants, so reading them from env (not the Source's Integration) is correct and `integration_id` legitimately stays null. This is a deliberate, documented deviation from the adapter-authoring rule "credentials come from the Integration"; when per-user Reddit accounts land later they layer on as a third mode without changing the keyless baseline. Env is read in one place per adapter (a small `resolveMode()`), never inline at call sites.

**Extract the shared feed path into `worker/adapters/feed.ts`.**
`parseFeed` moves out of `rss.ts` and gains a `kind` parameter: `parseFeed(xml, kind = "read")`. A new `fetchFeed(url, { userAgent?, kind? })` owns the timeout + size-cap + ok-check + optional `User-Agent`, then calls `parseFeed`. Three callers reuse it: `rssAdapter` (`fetchFeed(url)`), Reddit fallback (`fetchFeed(rssUrl, { userAgent: REDDIT_USER_AGENT })`), YouTube fallback (`fetchFeed(atomUrl, { kind: "watch" })`). Over leaving `parseFeed` in `rss.ts` and importing it into `youtube.ts` (a YouTube adapter importing from `rss` reads wrong) — `feed.ts` is the honest home for the primitive three adapters share. `rss.test.ts`'s import path updates to `./feed`; behavior is identical.

**Reddit canonical URL = the comments permalink, in *both* modes.**
Reddit `.rss` `<link>` is the comments permalink; the OAuth listing carries `data.permalink`. Emitting the permalink in both modes (`https://www.reddit.com${permalink}`) means flipping OAuth on/off never re-ingests the same post under a different URL — the `resources.url` unique key stays stable across modes. The alternative (OAuth mode emitting `data.url`, the external link for link-posts) would diverge from the RSS fallback and duplicate every post on a mode switch. `kind: read`.

**Reddit OAuth: app-only client-credentials token, acquired per adapter run.**
`POST https://www.reddit.com/api/v1/access_token` with HTTP Basic `client_id:client_secret` and `grant_type=client_credentials`, then `GET https://oauth.reddit.com/r/<subreddit>/<sort>?limit=<LIMIT>` with the bearer token. A descriptive `User-Agent` is sent on **every** Reddit request (OAuth and RSS) — Reddit rejects generic/absent agents. `ponytail:` no token cache — a Scan touches a handful of Reddit Sources, so a few extra token calls are nothing; add a module-level token+expiry cache only if Reddit-heavy topics make it measurable.

**Reddit sort modes are an OAuth-only capability; the RSS fallback pulls the default listing.**
`source.config.sort` (`hot`/`new`/`top`/`rising`, default `hot`) selects the OAuth listing path. The keyless `.rss` feed is the subreddit default ordering only — so "degraded" concretely means: default ordering, public rate limits, no sort control. This is exactly the traceable loss `degraded_sources` records; no extra work to make the fallback honor sort.

**YouTube keyed mode: uploads playlist via `playlistItems.list`, not `search.list`.**
`source.config` carries `channelId` (a `UC…` id) or `playlistId`. For a channel, the uploads playlist is the channel id with the `UC`→`UU` prefix swap (a stable YouTube invariant); then `GET …/youtube/v3/playlistItems?part=snippet&playlistId=<UU…>&maxResults=<LIMIT>&key=<KEY>`. Over `search.list?channelId=…` — `playlistItems` costs 1 quota unit vs 100 and returns uploads completely, so it is both cheaper *and* more correct. Each item's `snippet.resourceId.videoId` → `https://www.youtube.com/watch?v=<id>`, `kind: watch`.

**YouTube keyless mode + cross-mode idempotency for free.**
Fallback fetches `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` (or `?playlist_id=<id>`) through `fetchFeed(url, { kind: "watch" })`. The Atom `<link href>` is already `https://www.youtube.com/watch?v=<id>` — identical to what the API mode builds — so both modes dedupe to the same URL with no special handling.

**`fallbackMode?: string` on the adapter result; presence means degraded.**
`AdapterResult` gains an optional `fallbackMode`. An adapter sets it (`"reddit-rss"`, `"youtube-atom"`) **only** when it ran its keyless path; keyed modes and `rssAdapter` leave it unset. "Field present ⇒ this Source degraded" is the whole rule — no separate boolean. `runTopicScan` already has the Source in `ingestSource`, so it attaches `sourceId` to the outcome; `toScanSummary` collects `{ sourceId, fallbackMode }` for every ok outcome that carries a `fallbackMode`, and returns them alongside the existing tally.

**Persist the trace as `scans.degraded_sources jsonb NOT NULL DEFAULT '[]'`.**
Shape: `{ sourceId: string; fallbackMode: string }[]`. Empty ⇒ nothing degraded. A fallback is **not** a failure — `status` stays `succeeded`; `degraded_sources` is orthogonal to `status`. One additive column over a new table (the trace is a small per-Scan list) and over a bare boolean (loses which Source and which mode, which the requirement asks for). The trace is Scan-scoped, not per-Resource, because Resources are global and not source-attributed — that is the finest granularity the schema offers, and it is enough for a later Finding (which carries `scan_id`) to flag "this Scan had degraded Sources".

**Cost is `0` for every mode.** Reddit (OAuth + RSS) and YouTube (API quota, no per-call price; Atom) are all free; `cost: 0` throughout, matching `rssAdapter`.

**Testing: pure parsers offline, plus the tally.** `parsePosts(json): NewResource[]` (Reddit OAuth listing) and `parseVideos(json): NewResource[]` (YouTube `playlistItems`) are pure and tested with fixture JSON asserting canonical URL, `kind`, and within-payload dedupe. Both keyless paths ride `parseFeed`, already covered. `scan.test.ts` extends the `toScanSummary` check to assert `degraded_sources` collects a Source that reported a `fallbackMode` while a keyed Source contributes none. Mode selection and the live fetch/token calls stay thin wrappers `tsc -b` covers — no network in tests.

## Risks / Trade-offs

- **Reddit blocks generic/absent `User-Agent` and rate-limits public `.rss`** → a descriptive `User-Agent` constant on every request; a blocked/failed fetch degrades only that Source (existing isolation), it never aborts the Scan.
- **Cross-mode URL divergence would duplicate posts on a mode switch** → mitigated by emitting the comments permalink in both Reddit modes; YouTube is identical by construction.
- **YouTube Data API quota (10k units/day)** → `playlistItems` at 1 unit/call, one call per Source, keeps a Scan's usage trivial; no quota tracking built.
- **`UC`→`UU` uploads-playlist swap assumes a `UC…` channel id** → config must supply a `UC…` `channelId` or an explicit `playlistId`; handles (`@name`) are not resolved. Documented as a config contract, not silently guessed.
- **`degraded_sources` is Scan-scoped, not per-Resource** → accepted: Resources aren't source-attributed, and a Scan-level trace is enough for curation to flag degraded provenance. Revisit if per-Resource provenance is needed.
- **OAuth token fetched per run** → negligible at MVP volume; flagged so a later cache is a deliberate add, not a silent one.
- **Scores / comment counts fetched then dropped** → intended: no column, and their home is a Finding. Recorded here so a later reader doesn't "fix" it by bloating the global Resource with time-varying engagement metrics.

## Migration Plan

Additive column only: `db/schema.ts` gains `scans.degraded_sources`, then `bun run db:generate` emits the migration and `bun run db:migrate` applies it. The `DEFAULT '[]'` covers existing rows — no backfill. Deploy is the migration plus the `worker/` code (no new dependency, no `bun install`). Rollback: revert the code; the column is inert (nothing else reads it) and can be dropped later. Verification gate: `bunx biome check . && bunx tsc -b && bun test` — the `parsePosts`, `parseVideos`, and `toScanSummary` checks run offline.

## Open Questions

- `fallbackMode` string values (`reddit-rss`, `youtube-atom`) are free-form for MVP. If a consumer ever needs to switch on them, promote to a small union type — a one-line change on the shared result contract, deferred until there is a consumer.

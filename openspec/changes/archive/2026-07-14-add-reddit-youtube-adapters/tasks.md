## 1. Schema, contract, and env

- [x] 1.1 In `db/schema.ts`, add `scans.degradedSources` = `jsonb("degraded_sources").$type<{ sourceId: string; fallbackMode: string }[]>().notNull().default([])`
- [x] 1.2 Generate and apply the migration: `bun run db:generate` then `bun run db:migrate`; confirm the new SQL only adds the column with a `'[]'` default
- [x] 1.3 In `worker/adapters/adapter.ts`, add optional `fallbackMode?: string` to `AdapterResult` (set only on a keyless fallback)
- [x] 1.4 Add `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` to `.env.example` under a Reddit comment (leave `YOUTUBE_API_KEY` as-is)

## 2. Shared feed path

- [x] 2.1 Create `worker/adapters/feed.ts`: move `parseFeed` here and parameterize it as `parseFeed(xml, kind = "read")`; move `feedItemToUrl`/`hashContent` with it
- [x] 2.2 Add `fetchFeed(url, { userAgent?, kind? })` to `feed.ts`: the timeout + size-cap + ok-check fetch (optional `User-Agent`), then `parseFeed`; keep `FETCH_TIMEOUT_MS`/`MAX_FEED_BYTES` as top-of-file constants
- [x] 2.3 Rewrite `worker/adapters/rss.ts` to `fetchFeed(source.config.url)` and return `{ resources, cost: 0 }`; update `worker/adapters/rss.test.ts` to import `parseFeed` from `./feed`

## 3. Reddit adapter

- [x] 3.1 Create `worker/adapters/reddit.ts` with top-of-file constants: `REDDIT_USER_AGENT` (descriptive), `LIMIT`, and default `sort`
- [x] 3.2 Add `parsePosts(json): NewResource[]` (pure): map each OAuth listing child to a `read` Resource keyed by `https://www.reddit.com<permalink>`, deduped within the payload
- [x] 3.3 Add `redditAdapter`: resolve mode from `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`; OAuth path fetches a client-credentials token then `/r/<subreddit>/<sort>` with the `User-Agent` → `parsePosts`, `fallbackMode` unset; else `fetchFeed(<subreddit>.rss, { userAgent: REDDIT_USER_AGENT })` with `fallbackMode: "reddit-rss"`; cost `0`
- [x] 3.4 Create `worker/adapters/reddit.test.ts`: drive `parsePosts` with a fixture OAuth listing; assert canonical permalink URL, `kind: "read"`, and within-payload dedupe

## 4. YouTube adapter

- [x] 4.1 Create `worker/adapters/youtube.ts` with top-of-file constant `MAX_RESULTS`
- [x] 4.2 Add `parseVideos(json): NewResource[]` (pure): map each `playlistItems` entry to a `watch` Resource keyed by `https://www.youtube.com/watch?v=<videoId>`, deduped within the payload
- [x] 4.3 Add `youtubeAdapter`: read `channelId`/`playlistId` from config; with `YOUTUBE_API_KEY` fetch `playlistItems.list` on the uploads playlist (`UC`→`UU` swap for a channel id) → `parseVideos`, `fallbackMode` unset; else `fetchFeed(videos.xml?channel_id|playlist_id, { kind: "watch" })` with `fallbackMode: "youtube-atom"`; cost `0`
- [x] 4.4 Create `worker/adapters/youtube.test.ts`: drive `parseVideos` with a fixture `playlistItems` response; assert `watch?v=` URL, `kind: "watch"`, and within-payload dedupe

## 5. Registry and scan threading

- [x] 5.1 In `worker/adapters/index.ts`, register `reddit: redditAdapter` and `youtube: youtubeAdapter`
- [x] 5.2 In `worker/scan.ts`, carry `sourceId` and optional `fallbackMode` on the `ok` `SourceOutcome`; set them in `ingestSource`
- [x] 5.3 In `worker/scan.ts`, have `toScanSummary` collect `degradedSources` = `{ sourceId, fallbackMode }` for every `ok` outcome with a `fallbackMode`, and have `runTopicScan` write `degradedSources` to the Scan on completion (status still `succeeded`)
- [x] 5.4 Extend `worker/scan.test.ts`: feed `toScanSummary` a degraded outcome and a keyed outcome; assert `degradedSources` lists only the degraded one and the status is `succeeded`

## 6. Verify

- [x] 6.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test`

## 1. Dependency and shared interface

- [x] 1.1 Add `rss-parser` to dependencies (`bun add rss-parser`)
- [x] 1.2 Create `worker/adapters/adapter.ts`: export `SourceAdapter = (source: Source) => Promise<AdapterResult>` and `AdapterResult = { resources: NewResource[]; cost: number }`, importing `Source`/`NewResource` types from `db/schema`

## 2. RSS adapter

- [x] 2.1 Create `worker/adapters/rss.ts` with top-of-file constants `FETCH_TIMEOUT_MS` and a response-size cap
- [x] 2.2 Add `parseFeed(xml): NewResource[]`: parse RSS/Atom via `rss-parser`, map each entry to a Resource with canonical URL (`entry.link` trimmed, falling back to `entry.guid` when absolute), `title`, `kind: "read"`, and `content_hash` = sha256 of title+content; dedupe entries within the feed by canonical URL
- [x] 2.3 Add `rssAdapter`: read the feed URL from `source.config`, fetch it (timeout + size cap, keyless), pass the body through `parseFeed`, and return `{ resources, cost: 0 }`
- [x] 2.4 Create `worker/adapters/rss.test.ts`: drive `parseFeed` with fixture RSS **and** Atom strings; assert one Resource per entry, canonical URL, `kind: "read"`, and within-feed dedupe

## 3. Registry and scan orchestration

- [x] 3.1 Create `worker/adapters/index.ts`: export `sourceAdapters: Record<SourceKind, SourceAdapter>` = `{ rss: rssAdapter }`
- [x] 3.2 In `worker/scan.ts`, add a pure `toScanSummary(results)` helper computing `found_count` (deduped across Sources), summed `cost`, and the `succeeded`/`failed` rule (failed only when ≥1 Source ran and every one threw)
- [x] 3.3 In `worker/scan.ts`, add `runTopicScan(topicId)`: create a Scan (`running`), load the topic's Sources, dispatch each through `sourceAdapters[kind]` inside a per-Source `try/catch` (skip unregistered kinds), upsert the deduped Resources with `onConflictDoNothing({ target: resources.url })`, then write `found_count`/`cost`/`finished_at` and the status from `toScanSummary`
- [x] 3.4 Create `worker/scan.test.ts`: feed `toScanSummary` fake adapter results including a thrown Source; assert counts, summed cost, and both the succeeded and all-failed outcomes
- [x] 3.5 Update `worker/index.ts` to export `runTopicScan`

## 4. Verify

- [x] 4.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test`

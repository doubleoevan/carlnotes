## 1. The connection pool

- [x] 1.1 In `db/index.ts`, set the pool's `max` from `DATABASE_POOL_MAX` with a default of 40 and its `connectionTimeoutMillis` from `DATABASE_CONNECT_TIMEOUT_MS` with a default of 10,000, reading each once, and test that an unset, a valid, and an unreadable value give the default or the value
- [x] 1.2 In `api/index.ts`, report an error a route does not handle with `reportError` in an `onError`, keeping Hono's 500 response, and test that a throwing route responds 500 and reports the error
- [x] 1.3 Name both variables in `.env.example` beside `DATABASE_URL`, with their defaults

## 2. The indexes

- [x] 2.1 Declare `sources_topic_id_idx`, `attachments_topic_id_idx`, `findings_topic_relevance_idx` on `topic_id` and `relevance_score` descending, and `findings_scan_id_idx` in `db/schema.ts`, and generate one migration with `bun run db:generate`
- [x] 2.2 Apply the migration to the dev database with `bun run db:migrate`, and confirm with `explain`, sequential scans disabled, that the feed's sources, attachments, and ranked findings reads and `scanFindings` can each use an index

## 3. The bounded finding read

- [x] 3.1 In `api/topic/findings.ts`, limit `loadTopicFindings` to `TOPIC_FINDINGS_READ_LIMIT` of 1,000 rows, and send a threshold warning through `reportThresholdCrossing` when a read returns the whole limit
- [x] 3.2 Give `loadTopicFindings` and `loadTopicAccessAndFindings` an optional page window of an offset and a row count, and read each MCP `read_topic_feed` page from the cursor's offset with one row more than fits a page, packing that slice and deriving the next cursor from it
- [x] 3.3 Test that a read stops at the limit and warns, that a topic under the limit reads whole, and that the MCP read pages to the end of a feed longer than the limit

## 4. The per-request memo

- [x] 4.1 Add `db/requestMemo.ts`: an `AsyncLocalStorage` store of promises by key, `runWithRequestMemo`, `memoizeInRequest`, and `clearRequestMemo`, where outside a store `memoizeInRequest` just runs its read
- [x] 4.2 Make the `loadUserAccess` in `db/quotas.ts` the only one, reading the role, the plan, and the budget override into `UserAccess` through the memo, and re-export it from `api/authorization.ts` in place of its own copy
- [x] 4.3 Read `toTopicRole` in `api/topic/permissions.ts` through the memo, keyed by the user and the topic
- [x] 4.4 In `db/queryTracing.ts`, clear the sending request's memo when a statement starts with `insert`, `update`, or `delete`
- [x] 4.5 Open the memo for every request in a middleware registered first in `api/index.ts`
- [x] 4.6 Test that concurrent reads in one request share one query, that two requests keep their own memos, that a write statement clears the memo, and that a read outside a request goes to the database each time

## 5. The content reads

- [x] 5.1 Make `loadPages` in `api/content.ts` and `loadDocsPages` in `api/seo.ts` async, reading with `node:fs/promises` and `Bun.file`, and keep the parsed pages in module scope for 60 seconds, with concurrent reads sharing one refresh
- [x] 5.2 Await both in the blog routes and in `api/documents.ts`
- [x] 5.3 Test that a second read inside the ttl reads no file, that a read after it picks up a new file, and that concurrent reads share one refresh

## 6. Docs

- [x] 6.1 Describe `db/requestMemo.ts` and the pool variables in `db/AGENTS.md`, and the error report and the memo middleware in `api/AGENTS.md`
- [x] 6.2 Add `loadUserAccess` in `api/authorization.ts` to the structure audit's rename list as moved into `db/quotas.ts`

## 7. Verification

- [x] 7.1 Run `bash scripts/preflight.sh`
- [x] 7.2 Count the queries of a signed-in feed request and a signed-in topic page on the dev api before and after, and confirm each drops
- [x] 7.3 Send two signed-in feed requests at once and confirm no checkout waits for a connection, then send 50 concurrent `/api/topic-feed` requests to the dev api and confirm every request succeeds and `/api/health/deep` shows the waiting count back at zero once they finish
- [x] 7.4 Fetch `/llms-full.txt` in a loop on the dev api, and confirm the minute line's event loop delay stays at its idle level
- [x] 7.5 Compare every production topic's finding read with and without the limit, with `select` statements only, and confirm no topic returns fewer
- [x] 7.6 Run the api smoke tests under doppler

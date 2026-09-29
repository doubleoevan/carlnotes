## Context

The api and the worker each create one Neon `Pool` in `db/index.ts` from `DATABASE_URL`, the pooled endpoint, with no options. node-postgres then allows 10 connections per process and waits forever for a free one. A signed-out feed request sends 10 queries and a signed-in one 24, up to 14 of them at once: `buildTopicFeeds` in `api/topic/feeds.ts` reads its sections three at once, then its batched feed data eleven at once, while the route's quota reads run beside it. One signed-in feed request already queues 4 of its own queries for a connection.

Production's first traced `GET /api/topic-feed` after the telemetry change, 174 ms in all, spent 104 ms on the ranked findings query, 56 ms reading `sources` by topic id, and 32 ms reading `attachments` by topic id. `db/schema.ts` declares `sources` and `attachments` with no index at all. `findings` has one unique on `(topic_id, resource_id)`, which finds a topic's rows but gives no relevance order, and nothing on `scan_id`, which `scanFindings` in `api/seo.ts` filters on for every public topic page's structured data and every scan email.

`loadTopicFindings` in `api/topic/findings.ts` joins findings, resources, and scans, plus a signed-in user's consumptions and bookmarks, with no limit. The topic page then walks the rows three more times, and the MCP `read_topic_feed` loads the whole set before `packPage` slices one page from it. Review prunes each topic to its `maxTopicFindings`, at most 20, except for bookmarked and rated findings, which it keeps however many there are. Production's largest topic has 24 findings, and the average is 16.

`loadUserAccess` exists twice. `api/authorization.ts` reads the role, the plan, and the budget override, for `isAllowed` and the spend checks. `db/quotas.ts` reads the role and the plan, for the quota functions the api and the worker share. A signed-in feed request reads the user row about three times, a topic page about six, and `toTopicRole` in `api/topic/permissions.ts` reads the same membership again for each permission a page checks.

`loadPages` in `api/content.ts` and `loadDocsPages` in `api/seo.ts` list and read their Markdown files with `readdirSync` and `readFileSync` on every request to `/blog`, `/blog/:slug`, `/llms.txt`, `/llms-full.txt`, `/feed.xml`, and `/sitemap.xml`.

## Goals / Non-Goals

**Goals:**

- No request waits on its own queries for a connection, and two requests at once fit the pool. A larger burst queues and drains instead of hanging, and a request that cannot get a connection fails in bounded time, visibly.
- Every read by topic id or scan id uses an index, and the feed's relevance order comes from one.
- No read returns an unbounded set, and no topic under the read limit, which is every topic in production, loses a finding a user can see today.
- A request reads its user's access row and each topic role once.
- No request blocks the event loop on the filesystem.

**Non-Goals:**

- Redis, a CDN, replicas, or any other infrastructure.
- A change to any response, page, or MCP result's content for a topic under the read limit.
- The worker's own reads, the billing paths, and the scan pipeline.

## Decisions

**The pool is sized by an environment variable, with a default of 40, and times out after 10 seconds.** `DATABASE_POOL_MAX` sets `max` and `DATABASE_CONNECT_TIMEOUT_MS` sets `connectionTimeoutMillis`. Forty is more than two signed-in feed requests' worth of concurrent queries, and the pooled endpoint shares its own server connections among many client connections, so the api's forty and the worker's forty cost little on Neon's side. pg-pool's `connectionTimeoutMillis` bounds both a new connection's handshake and a request's wait in the pool's queue, so one setting covers both ways a request can hang. Ten seconds sits above a waking Neon compute's startup and below any client's patience. A request past it fails with pg-pool's "timeout exceeded when trying to connect" error.

**The api reports an error Hono catches.** Hono catches a route's error and responds 500 with a log line, so the error never reaches the Bun integration's handler and Sentry never sees it. An `onError` on the server reports the error with `reportError` and keeps Hono's 500 response. A pool timeout then reaches Sentry as an issue, beside the minute reporter's pool-waiting warning. Every other uncaught route error reaches Sentry too, which it does not today.

**One migration adds the four indexes.** `sources_topic_id_idx`, `attachments_topic_id_idx`, `findings_topic_relevance_idx` on `(topic_id, relevance_score desc)`, and `findings_scan_id_idx`, following the schema's `<table>_<column>_idx` names, in one `bun run db:generate` migration that runs with the deploy. At a few hundred rows per table a plain `create index` locks each table for milliseconds, so `concurrently` is not worth the migration it cannot run inside. The composite serves both the feed's `row_number() over (partition by topic_id order by relevance_score desc)` window and the topic page's relevance order. On tables this small the planner can still choose a sequential scan, so the check runs `explain` with `enable_seqscan` off, which proves each index is usable, and again on a copy of production data.

**A topic's finding read stops at 1,000 rows, and reaching the limit is reported.** `TOPIC_FINDINGS_READ_LIMIT` in `api/topic/findings.ts` is about forty times the largest topic in production and fifty times the most review keeps without a bookmark or a rating, so it only ever stops a topic far larger than any real one. A topic whose users bookmark or rate a finding every day for two years still stays under it. A read that returns the whole limit sends a threshold warning through `reportThresholdCrossing`, so the limit is raised long before a real topic reaches it. A topic past the limit loses its least relevant findings from the topic page's read, bookmarked and rated ones included, and the MCP feed still pages through all of them. Keeping the bookmarked and rated ones first would need an order the relevance index cannot return, for a topic no real one comes near, so the warning is the safeguard instead. A lower limit would drop the lowest-scored rows first, which can be exactly the bookmarked ones review kept.

**The MCP feed read pages at the database.** `loadTopicFindings` takes an optional page window, an offset and a row count, and `readTopicFeed` asks for the cursor's offset and one more row than fits a page. `packPage` packs from that slice, and the next cursor is the offset plus the page's length, present only if a row remains. An MCP client following the cursor reads every finding, past the topic page's limit too, and each call reads one page of rows instead of the topic's whole set.

**One access loader, read once per request through a request memo in `db/`.** `db/quotas.ts` keeps the one `loadUserAccess`, reading the role, the plan, and the budget override into the shared `UserAccess`, and `api/authorization.ts` re-exports it. A new `db/requestMemo.ts` keeps a `Map` of promises in an `AsyncLocalStorage` store that the api opens for every request, beside the query count. `memoizeInRequest(key, load)` returns the store's promise for the key, starting it once, so concurrent permission checks in one `Promise.all` share a single read. `loadUserAccess` keys by user and `toTopicRole` by user and topic. Outside a request the store is absent and both read the database, so the worker behaves exactly as before. The billing paths run inside the Stripe webhook's request, but they read the user row with their own query, after the write that clears the memo. Hono's `contextStorage` would put the memo on the Hono context itself, but `db/quotas.ts` cannot read Hono's context without depending on the api's framework.

**A write statement clears the request's memo.** The query wrapper in `db/queryTracing.ts` already sees every statement a client sends, bound to the request that sent it. A statement that starts with `insert`, `update`, or `delete` clears that request's memo, so a request that changes a role, a plan, or a membership and then reads it again reads the database. No route does that today: `setUserRole` checks the acting user's access before it writes the target's, and `syncUserPlan` re-reads through the worker's own query. The clear is what keeps it true for the next route, with no call site to remember.

**The content files are read asynchronously and kept for 60 seconds.** `loadPages` and `loadDocsPages` become async, read with `node:fs/promises` and `Bun.file`, and keep their parsed pages in module scope with the time they were read. Concurrent requests during a refresh share one read. A new or edited file appears within 60 seconds on the dev server. In production a file changes only with a deploy, which starts a new process with an empty cache, so the ttl only matters while writing a post locally.

## Measurement

Each decision is checked with the telemetry change's own instruments:

- Queries per request, from `db.query_count` or the query count directly, for a signed-in feed and a signed-in topic page, before and after. The memo alone should remove about two reads from the feed and about five from the topic page.
- Two concurrent signed-in feed requests with no checkout waiting for a connection, and a 50-concurrent load test against `/api/topic-feed` on the dev api where every request succeeds and `/api/health/deep` shows `waitingCount` back at zero once the burst drains.
- `explain` of the feed's sources, attachments, and ranked findings reads, and of `scanFindings`, showing index scans.
- The minute line's event loop delay staying flat while a loop fetches `/llms-full.txt`.
- Every topic's finding count before and after, on a copy of production data, with no topic returning fewer findings.

## Risks / Trade-offs

- [Forty connections per process, times more processes later, could reach Neon's pooler limits] → The pooler accepts thousands of client connections and bounds its own server pool, and `DATABASE_POOL_MAX` lowers the size without a deploy.
- [A 10-second timeout fails a request that would have succeeded after a longer wait] → Any wait that long is already an outage, and the failure now reaches Sentry beside the pool-waiting warning.
- [A write clears the whole request's memo, including entries it did not change] → A request that writes is rare among reads, and the next read costs one query.
- [A cached content page is up to 60 seconds old on the dev server] → Production reads files only once per deploy.

## Migration Plan

The migration adds indexes and changes no data, and runs with the deploy like any other. Rolling back the code leaves the indexes in place, where they cost only their writes. The two pool variables are optional, and unset they take the defaults above.

## Resolved Questions

- The finding comparison ran read-only against production itself, with `select` statements only, instead of on a Neon branch, which would have needed the user's approval to create. Every one of production's 37 topics read the same findings with the limit as without it, and the largest read 24.

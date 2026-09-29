## Why

One page load can want more database connections than the whole process has. The pool keeps node-postgres' default of 10 connections, while a signed-in feed request sends 24 queries, up to 14 of them at once. Past the pool, the feed and the topic page read two tables with no index, a topic's finding read has no bound, nearly every permission check in a request reads the user's access row again, and the blog and docs routes read their files synchronously on every request, so one crawler reading `llms-full.txt` stalls every other request on Bun's single thread. Production's first traced feed request after the telemetry change shows where the time goes: the ranked findings query took 104 ms, the `sources` read 56 ms, and the `attachments` read 32 ms, each over a table read by topic id. None of this needs new infrastructure, and none of it changes what a user sees.

## What Changes

- The connection pool takes its size from `DATABASE_POOL_MAX`, with a default of 40, well above one request's concurrency, and its connection timeout from `DATABASE_CONNECT_TIMEOUT_MS`, with a default of 10 seconds, so a request that finds no free connection fails with an error instead of hanging. The api reports an error that Hono catches to Sentry, so that failure reaches Sentry as an issue and not only as a log line.
- One migration adds four indexes: `sources.topic_id`, `attachments.topic_id`, `findings (topic_id, relevance_score desc)`, and `findings.scan_id`.
- `loadTopicFindings` reads at most 1,000 findings, about forty times the largest topic in production, and a read that reaches the limit sends a Sentry warning. The MCP `read_topic_feed` read pages at the database from its cursor's offset, so it never truncates a feed.
- A request reads the user's access row and each topic role once, through a request memo. The two copies of `loadUserAccess`, in `api/authorization.ts` and `db/quotas.ts`, become one in `db/quotas.ts`. Any write statement a request sends clears that request's memo, and code outside a request, such as the worker, reads the database directly.
- The blog and docs files are read asynchronously and kept in module scope for 60 seconds. A new file still ships by being added, and appears within that ttl.

## Capabilities

### New Capabilities

- `request-capacity`: the connection pool's size and timeout, the indexed lookups, the bounded finding read, the per-request memo of access reads, and content reads that never block the event loop.

### Modified Capabilities

- `mcp-server`: the feed read pages at the database, so a topic past the topic page's read limit still pages to its end.

## Impact

- `db/index.ts` (pool options), `db/schema.ts` and a new migration (indexes), `db/quotas.ts` (the one access loader), `db/requestMemo.ts` (new), and `db/queryTracing.ts` (a write clears the memo).
- `api/index.ts` (the memo middleware and the error report), `api/authorization.ts`, `api/topic/permissions.ts`, `api/topic/findings.ts`, `api/topic/helpers.ts`, `api/mcp/results.ts`, `api/content.ts`, `api/seo.ts`, and `api/documents.ts`.
- `.env.example` names the two pool variables. No dependency is added, and no response changes shape.

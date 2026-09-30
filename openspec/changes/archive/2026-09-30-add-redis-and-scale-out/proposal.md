## Why

One api process and one worker process are the app's limit, because both keep state in memory. Every `/api/*` request runs a session read against Postgres, anonymous ones included, and two client polls multiply it. The topic page reloads every three seconds while a scan runs, and the chat mention badge polls every forty-five seconds per tab, so ten thousand open tabs on the badge alone is over two hundred session reads a second. Past that, the 35.2 load test showed the one api process CPU-bound on the feed, with event loop delay near 290 ms at 50 concurrent requests, and each SSE stream is a browser-to-process socket no cache can remove. The worker's limit is arithmetic. 8 concurrent scan activities against the 244-second mean scan measured over the last fourteen days is about 2,800 scans a day, and the free plan grants one daily topic, so roughly 2,800 active free users fill the pipeline. Neither the api nor the worker can run a second copy today. The rate limiter, the suggestion counter, the flag counter, and the sweep's guard are all per-process maps that a second process would silently double, and the two live-update brokers each hold a direct Neon connection outside the connection pooler.

## What Changes

In this order, each part depending on the one before it:

**One, Redis for sessions, poll caches, and limiters.** The Northflank Redis addon, reached through `REDIS_URL`, becomes Better Auth's secondary storage, so the session read on every request no longer goes to Postgres. Sessions stay written to Postgres too, and every Redis read and write is wrapped to fall through on failure, so a Redis outage or restart signs nobody out and Better Auth's own sign-in limiter, which moves to secondary storage with it, fails open instead of closed. The two polled responses are cached for a few seconds each, keyed by user: the mention count and the topic page's scan poll. The three in-memory limiters move to Redis with the same limits, windows, and keys: the per-tool-caller rate limiter, the daily suggestion counter, and the flag-content counter. Their maps are deleted. While Redis is down the caches fall through to their sources and the limiters fail open. A local Redis joins docker-compose, and the api's minute line gains the Redis connection state and its hit, miss, and error counts.

**Two, the chat and note fan-out moves from Postgres LISTEN/NOTIFY to Redis pub/sub.** The two brokers stop opening a direct connection per process, and `DATABASE_URL_DIRECT` is removed with the helper that read it. Delivery keeps its per-process emitters and its reconnect backoff from one second doubling to thirty. Both brokers take the note broker's shape. They deliver to their own process first and skip the echo of their own publish. Neither broker replays what a dropped connection missed, as today.

**Three, the api runs as replicas.** The port comes from the environment, the minute line names its instance, and the module-scope state that assumed one process is audited. What dedupes concurrent work stays per process, what limits or counts moved in part one, and what remains per process is recorded with why that is acceptable. The per-replica pool and the Neon connection limit it must fit are stated as a rule.

**Four, scan throughput.** Scan concurrency becomes configurable and the worker runs as replicas, sized against the measured scan duration. The sweep selects only due topics in SQL, runs its per-owner reads eight at a time, and caches each owner's quota for the length of the sweep. A scan records when a worker picks it up, staleness is measured from that moment, and a scan still queued past the window is left alone for the backlog alert instead of being failed. The monthly budget reset moves out of the sweep into its own daily job, which replaces four keys at a time. Both the sweep and the reset take a database-level claim instead of the in-memory guard, so two overlapping runs cannot do the work twice.

**BREAKING**: `DATABASE_URL_DIRECT` is no longer read. `REDIS_URL` is a new required setting in production, and Redis 7.2 or later is required by Bun's client. The monthly budget reset no longer runs inside the sweep, so a deployment must add the reset job's schedule or keys stop resetting.

## Capabilities

### New Capabilities

- `redis-store`: the Redis client every module shares, its fall-through behavior, the session secondary storage with its Postgres fallback, the caches for the two polls, the shared fixed-window counters behind the three limiters, the local Redis in docker-compose, and the Redis gauges on the api's minute line.

### Modified Capabilities

- `user-auth`: a session is read from Redis first and kept in Postgres, so Redis being unreachable never signs anyone out.
- `mcp-server`: the per-tool-caller rate limit counts in Redis, shared by every api replica, and fails open while Redis is unreachable.
- `source-suggestion`: the daily suggestion limit counts in Redis, so it survives a deploy and holds across replicas.
- `content-reporting`: the daily flag limit counts in Redis with a rolling day from the first flag, shared across replicas.
- `team-chat`: the room's cross-instance fan-out is Redis pub/sub instead of LISTEN/NOTIFY, and the mention count is served from a short cache that opening a room clears.
- `tasting-note-sync`: the note's cross-instance poke goes over Redis pub/sub.
- `topic-detail-page`: a poll reload of the topic page is served from a two-second cache keyed by user and topic.
- `request-capacity`: the pool is sized per replica against Neon's server-side connection limit, and the sweep reads each owner's quota once per sweep.
- `performance-telemetry`: the minute line names its instance and, on the api, reports Redis, and a crossed threshold alerts once an hour per process, so once per replica.
- `deploy-mechanics`: the app listens on the configured port, both services run as replicas, and the budget reset is its own scheduled job.
- `scheduled-scans`: the sweep selects due topics in SQL under a database claim, caches quotas per sweep, measures staleness from pickup with a second bound for a scan queued past its ingest stage's total timeout, and no longer resets budgets.
- `durable-scans`: a scan records its pickup, the stale window counts from it, and scan concurrency is configured.
- `subscription-billing`: the monthly budget reset is a scheduled job that replaces four keys at a time, not a step of the sweep.

## Impact

- **New runtime dependency**: Redis, through Bun's built-in `RedisClient`. No new package. `REDIS_URL` in `.env.example`, Doppler dev and prd, and docker-compose.
- **api/**: `auth.ts` (secondary storage), `api.ts` (the mention count cache), `rateLimit.ts` (Redis store), `flagContent.ts` (Redis counter), `chat/roomStream.ts` and `note/noteStream.ts` (pub/sub), `chat/mentions.ts` (saving mentions as seen clears the count cache), `index.ts` (port from the environment, Redis gauges), `topic/topics.ts` (the poll flag and its cache), `sessions.ts` (the session keys the app writes where it changes a user outside Better Auth), and `users.ts`, `billing.ts`, `admin.ts`, `usernames.ts`, and `avatars.ts` (refresh a user's sessions after a direct write, and revoke them before an account closes).
- **db/**: a new `redis.ts` (the client, fall-through wrapper, cache, window counter, pub/sub, gauges, and the Redis-down threshold), a new `claim.ts` (the advisory-lock claim), `quotas.ts` (suggestion counter), `schema.ts` (`scans.picked_up_at`) with one generated migration.
- **shared/**: `runtimeGauges.ts` (instance id), `monitoring.ts` (the note on per-replica warnings).
- **worker/**: `temporal.ts` (configurable concurrency), `schedule.ts` (SQL selection, claim, quota cache, reaper from pickup, reset removed), `litellm.ts` (the reset, four keys at a time), a new `resetMonthlyBudgets.ts` entry, `workflows/run-topic-scan-activities.ts` (the pickup time), `concurrency.ts` (the bounded runner moved out of review).
- **ui/**: `components/topic/TopicScanButton.tsx`, `pages/TopicPage.tsx`, `clients/topicClient.ts` (the poll flag).
- **Docs**: README (the live-updates section that says there is no Redis, the process table, the Development scripts), `.env.example`, the root `AGENTS.md` module map, `api/AGENTS.md`, `db/AGENTS.md`, `worker/AGENTS.md`, the stale-name list in `.agents/commands/audit-structure.md`, `package.json` (`reset:monthly-budgets`).
- **Platform, outside the repo**: the Redis addon and `REDIS_URL` in Doppler prd, the api and worker replica counts and sizes, `PORT`, `SCAN_CONCURRENCY`, the reset job's cron, and the Neon compute size the pool rule reads.
- **Ordering with other work**: raising scan concurrency waits on the email change that limits digest sends, since each finished scan sends its digest batch.

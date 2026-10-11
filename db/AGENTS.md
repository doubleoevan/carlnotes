# db/

Drizzle + Neon Postgres, and the Redis store.

- `schema/` — the schema, one file per domain: `users.ts` (users and Better Auth's tables), `topics.ts`, `scans.ts`
  (scans, resources, findings, and the finding markers), `teams.ts`, `invites.ts`, `chat.ts`, `notes.ts`, `podcast.ts`,
  `billing.ts`, `releases.ts`, `storage.ts` (favicons and the pending object deletions), and `columns.ts` (the pgEnums
  and the column helpers they share). A table references another file's table through a lazy `references`, so the
  files import each other freely. `index.ts` spreads every file into the one `schema` object the client is bound to.
- `index.ts` — the pooled client, the connection pool's counts, `sizeConnectionPool`, `isUniqueViolation`, and the
  `DbTransaction` and `DbHandle` types that a function sharing its caller's transaction takes.
  Each long-running process, the api, the Temporal worker, the sweep, and the budget reset, awaits
  `sizeConnectionPool` at startup. It reads `SHOW max_connections` and sizes the pool to 0.9 times that value, the
  share Neon's connection pooler holds on its server side for one user and database, divided by the pool count, how
  many processes can hold a pool at once: 8 by default, or `DATABASE_POOL_COUNT`. `DATABASE_POOL_MAX` sets the size
  itself instead. Until the read completes, and if it fails, the pool holds 15 connections, and a failed read is
  reported. A process with no `DATABASE_URL`, such as a test, keeps the default and reads nothing. The size is logged
  at startup. A request waiting for a connection fails after `DATABASE_CONNECT_TIMEOUT_MS`, 10 seconds by default. A
  short-lived job keeps the default.
  `isUniqueViolation` is true if an error is Postgres rejecting a duplicate key.
- `redis.ts` — the Redis store, on Bun's built-in client from `REDIS_URL`.
  `runWithRedis` runs one operation and returns null on any failure,
  and `cacheJson` returns a cached value, or loads the value and caches it.
  `incrementRateLimitWindow` is the fixed window counter behind the api's shared limiters, and `takeRateLimitSlot`
  is the slot that one call holds at a time, behind the Resend limit that the api and the worker share.
  `publishToChannel` and `subscribeToChannel` are the fan-out, and each process subscribes on one subscriber connection.
  `addSubscriberReconnectListener` runs a listener each time that connection has come back after a drop.
  `readAndResetRedisGauges` returns the minute line's counts.
  `redisConnection.ts` is one connection and its reconnects: the client options, the connect with its backoff, the
  reconnect on a drop, and the failed operation count. The store holds a command connection and a subscriber
  connection over it. The store reconnects with no limit on attempts, and the reconnect delay doubles from one
  second up to 30 seconds.
  If an operation returns null, the caller goes on without Redis.
  Sessions read Postgres, a cache calls its loader, and a Resend call goes out without a slot.
  A limiter counts the hit in this process's memory instead, so a caller stays bounded at the limit per replica.
- `memoryRateLimitWindows.ts` — the rate limit windows a process counts in memory while Redis cannot count them,
  bounded by expiry and by a limit of 10,000 keys, the oldest evicted first. A memory count is never written to Redis.
- `claim.ts` — `runWithClaim` runs the sweep and the budget reset under a database-level claim.
  The claim is a transaction-level advisory lock keyed by the claim's name.
  The lock works through the connection pooler and releases with the transaction no matter how the task ends.
  A sweep or reset that starts while the claim is held does nothing.
- `quotas.ts` — the derived per-user limits, and `loadUserAccess`, the one read of a user's role, plan, and budget
  override, which the api and the worker share.
  `monthlySpendDollars` reads a user's spend for the month on scans, chat turns, and podcast episodes.
  `isPodcastEpisodeBudgetShareExhausted` is true once that spend reaches the plan's share of the budget, which pauses
  episodes. `hasFullPodcastEpisodes` is true on a paid plan or for an admin, and the free plan gets short episodes.
- `podcastFeedCache.ts` — the Redis keys of a Topic's rendered podcast feeds,
  and `deletePodcastFeedCache`, which a publish, a removal, or a rename runs.
- `requestMemo.ts` — the reads one request repeats, its user's access and each topic role, kept in the request's
  async context. The api opens a memo for every request, and outside a request every read goes to the database.
- `queryTracing.ts` — counts each statement a request sends and traces it under the request's span, and counts the
  request's cache hits and misses with the keys that missed, which `redis.ts` reports to it. A write statement clears
  the memo of the request that sent it. `countRequestStatement` is the one count, which the connection pool stub
  calls too, so a test's queries count the way real ones do.
- `redisFakeServer.ts` — the fake Redis server behind `redis.test.ts`: in-memory clients that connect, drop,
  subscribe, and deliver published messages, with the reconnect delays shortened to nothing.
- `redisClientStub.ts` — the Redis client stub that the tests share. `stubRedisClient` swaps the store's clients for
  in-memory fakes over one map and returns the map, and `restoreRedisClient` puts the store's own builder back. Only
  tests import it.
- `connectionPoolStub.ts` — the connection pool stub that the tests share. `stubConnectionPool` returns the rows that
  a test picks for each query, records each query sent, counts each one toward the running request, and runs a
  transaction's callback on the stubbed client. `restoreConnectionPool` puts the pool's own query and the client's own
  transaction back, and `toTableRow` builds a row in a table's column order. Only tests import it.
- `migrate.ts` applies pending migrations, and `seed.ts` has the dev stub data behind `bun run db:seed`.
- Schema changes edit the domain's file in `schema/`, then `bun run db:generate` writes the migration (offline, no
  doppler) and `bun run db:migrate` applies it (its script already runs under doppler). Never
  hand-edit an applied migration.
- All Postgres access goes through Drizzle here; no `Bun.sql`, `pg`, or raw clients anywhere.
- This module imports nothing app-level.
- Tests: `bun test db`.

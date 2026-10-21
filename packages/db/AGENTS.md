# packages/db/

`@carlnotes/db`: Drizzle + Neon Postgres, the Redis store, and object storage, every store the app writes to.
`@carlnotes/emails`, `models`, and `pipeline`, `apps/api`, and `apps/worker` import it; it imports `@carlnotes/server`
and `@carlnotes/contracts`, with `drizzle-orm` and `@neondatabase/serverless`.

- `schema/` — the schema, one file per domain: `users.ts` (users and Better Auth's tables), `topics.ts`, `scans.ts`
  (scans, resources, findings, and the finding markers), `teams.ts`, `invites.ts`, `chat.ts`, `notes.ts`, `podcast.ts`,
  `billing.ts`, `releases.ts`, `claims.ts` (the claims' lease rows), `storage.ts` (favicons and the pending object
  deletions), `vectors.ts` (the topic and podcast episode vectors that rank related topics, related podcast episodes,
  and the podcast episode search, each table kept apart from the row it ranks so a read of a whole row never includes a
  vector, and each table's public and shown flag with its partial HNSW index), and `columns.ts` (the pgEnums and the
  column helpers they share). A table references another file's table through a lazy `references`, so the files import
  each other freely. `index.ts` spreads every file into the one `schema` object the client is bound to.
- `index.ts` — the pooled client, the connection pool's counts, `sizeConnectionPool`, `isUniqueViolation`, and the
  `DbTransaction` and `DbHandle` types that a function sharing its caller's transaction takes. Each long-running
  process, the api, the Temporal worker, the sweep, and the budget reset, awaits `sizeConnectionPool` at startup. It
  reads `SHOW max_connections` and sizes the pool to 0.9 times that value, the share Neon's connection pooler holds on
  its server side for one user and database, divided by the pool count, how many processes can hold a pool at once: 8 by
  default, or `DATABASE_POOL_COUNT`. `DATABASE_POOL_MAX` sets the size itself instead. Until the read completes, and if
  it fails, the pool holds 15 connections, and a failed read is reported. A process with no `DATABASE_URL`, such as a
  test, keeps the default and reads nothing. The size is logged at startup. A request waiting for a connection fails
  after `DATABASE_CONNECT_TIMEOUT_MS`, 10 seconds by default. A short-lived job keeps the default. `isUniqueViolation`
  is true if an error is Postgres rejecting a duplicate key. `runWithIterativeIndexScan` runs a ranked read in a
  transaction that sets pgvector's `hnsw.iterative_scan` to `strict_order`, so an HNSW scan continues past its first
  candidates until the filters after it fill the read's limit. `isFindingShown` keeps a finding no user rated down,
  `hasEnoughFindingsToList` a topic with enough of those findings to be listed, `isPublicAndShown` a public topic that
  has them, and `isCurrentModelEmbedding` a resource the current embedding model embedded. The api and the worker both
  apply them.
- `store.ts` is object storage, through Bun's built-in S3 client that the `S3_*` settings select: the uploads, the
  reads, the object keys, and `deleteStoredObject`. It deletes through the bucket and clears the key's row in
  `pending_object_deletions`, and a failed delete writes its failure to that row with the next try pushed back. A write
  that deletes or fails the row naming an object records the key with `recordPendingObjectDeletions` in the same
  transaction, and an upload records its key first with `recordPendingObjectDeletionBeforeUpload`, with a grace period,
  and clears it with `clearPendingObjectDeletion` in the row insert's transaction.
  `apps/worker/retryPendingObjectDeletions.ts` retries the pending keys after the sweep. Resource content deletes
  through `deleteStoredObject` with no pending row. Its key is fixed per Resource, and the next fetch rewrites it.
  `store.smoke.ts` (`bun run smoke:store`) uploads a fake resource's content, reads it back, and checks the key, size,
  and body round-trip against the live bucket.
- `redis.ts` — the Redis store, on Bun's built-in client from `REDIS_URL`.
  `runWithRedis` runs one operation and returns null on any failure, including a command with no reply in two
  seconds, and three such commands in a row replace the client, so a wedged connection never holds every request.
  `cacheJson` returns a cached value, or loads the value and caches it. `redisGauges.ts` holds the extra gauges the
  minute line reads: the store's counts with the server's used and maximum memory, warning if the command connection
  is down, at eight tenths of the memory limit, and at ten errors in a minute.
  `redisRateLimits.ts` holds the rate limits over the store: `incrementRateLimitWindow` is the fixed window counter
  behind the api's shared limiters, `countRateLimitHit` counts a hit and returns whether it is within a limit, and
  `takeRateLimitSlot` is the slot that one call holds at a time, behind the Resend limit that the api and the worker
  share.
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
  The claim is a lease row in `claims`, keyed by the claim's name, taken in one statement that inserts the row or
  takes over an expired one. The run renews the two-minute lease every 30 seconds by the database clock, and deletes
  its own row when the task ends, however it ends. No transaction stays open between statements.
  A renewal that finds the lease expired or taken aborts the signal the task receives, and the run rejects with a
  `ClaimLostError`. A process that dies leaves a lease that expires on its own.
  A sweep or reset that starts while another run's lease is live does nothing and returns null.
- `quotas.ts` — the derived per-user limits, and `loadUserAccess`, the one read of a user's role, plan, and budget
  override, which the api and the worker share.
  `monthlySpendDollars` reads a user's spend for the month on scans, chat turns, and podcast episodes, once per request
  through the request memo. `hasFullPodcastEpisodes` is true on a paid plan or for an admin, and the free plan gets
  short podcast episodes.
- `monthlyBudgetCutoffs.ts` — the monthly budget cutoffs. `isMonthlyBudgetCutoffPassed` is true once the month's spend
  reaches the share of the budget where the plan stops a kind of spend: spoken questions, full podcast episodes,
  podcast episodes, daily scans, or manual scans. The daily scans cutoff moves with the daily scans left this month, at
  the mean cost of `loadRecentScanCostDollars` over the scans not started by hand, with a weekdays topic charged only
  for the weekdays left, and `loadMonthlyBudgetCutoffs` returns every cutoff for the spend meter.
- `podcastFeedCache.ts` — the Redis keys of a Topic's rendered podcast feeds,
  and `deletePodcastFeedCache`, which a publish, a removal, or a rename runs.
- `requestMemo.ts` — the reads one request repeats, its user's access, each topic role, and its monthly spend, kept
  in the request's async context. The api opens a memo for every request, the worker one for each podcast episode plan
  and each sweep's limit reads, and outside a memo every read goes to the database.
- `queryTracing.ts` — counts each statement a request sends and traces it under the request's span, and counts the
  request's cache hits and misses with the keys that missed, which `redis.ts` reports to it. A write statement clears
  the memo of the request that sent it. `countRequestStatement` is the one count, which the connection pool stub
  calls too, so a test's queries count the way real ones do.
- `redisFakeServer.ts` — the fake Redis server behind `redis.test.ts`, `redisRateLimits.test.ts`, and
  `redisGauges.test.ts`: in-memory clients that connect, drop, subscribe, and deliver published messages, with the
  reconnect delays shortened to nothing. `startFakeRedisStore` builds the store's clients on a fresh one, and
  `toEveryTimerInstantSetTimeout`, which the billing tests share for the key reissue's retries, runs every timer at
  once.
- `redisClientStub.ts` — the Redis client stub that the tests share. `stubRedisClient` swaps the store's clients for
  in-memory fakes over one map and returns the map, and `restoreRedisClient` puts the store's own builder back. Only
  tests import it.
- `quotaTestFixtures.ts` — `withSpendQueryRows`, the stubbed rows that the quota and monthly budget cutoff
  tests share: an access row and each table's spend sum. Only tests import it.
- `connectionPoolStub.ts` — the connection pool stub that the tests share. `stubConnectionPool` returns the rows that
  a test picks for each query, records each query sent, counts each one toward the running request, and runs a
  transaction's callback on the stubbed client. `restoreConnectionPool` puts the pool's own query and the client's own
  transaction back, and `toTableRow` builds a row in a table's column order. The free, plus, and admin access rows
  and `toSpendSumRows`, a spend sum's row from the dollars given for each table, are what the spend tests return. Only
  tests import it.
- `chatTurnShapes.smoke.ts` (`bun run smoke:chat-turns`) — inserts a row of every chat turn kind, each chat proposal
  shape, and every mismatched shape inside one rolled-back transaction, proving each check constraint rejects a row
  whose columns do not match its kind.
- `migrate.ts` applies pending migrations, then sets the role's `statement_timeout` to 30 seconds, which the connection
  pooler's server connections take as the role's default, so a runaway query is cancelled instead of holding a pooled
  connection. A migration that needs longer puts `SET LOCAL statement_timeout = 0` first in its own SQL. `seed.ts` has
  the dev stub data, which `apps/api/seed.ts` runs behind `bun run db:seed`.
- Schema changes edit the domain's file in `schema/`, then `bun run db:generate` writes the migration (offline, no
  doppler) and `bun run db:migrate` applies it (its script already runs under doppler). Never
  hand-edit an applied migration. `migrations/` is generated; never read it for the schema.
- All Postgres access goes through Drizzle here; no `Bun.sql`, `pg`, or raw clients anywhere.
- Imports: `@carlnotes/server` and `@carlnotes/contracts` only; never `emails`, `models`, `pipeline`, or an app, which
  all come after it.
- Tests: `bun test packages/db`; `*.smoke.ts` run under `doppler run`.

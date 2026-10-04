# db/

Drizzle + Neon Postgres, and the Redis store.

- `schema.ts` — the one schema registry.
- `index.ts` — the pooled client, the connection pool's counts, and `isUniqueViolation`.
  The connection pool opens up to `DATABASE_POOL_MAX` connections, 40 by default,
  and a request waiting for a connection fails after `DATABASE_CONNECT_TIMEOUT_MS`, 10 seconds by default.
  Every api replica, every worker replica, the sweep, and the monthly budget reset can run at once,
  and each opens its own connection pool.
  The connection pools' sizes together must fit the connection pooler's server-side pool for one user and database.
  That server-side pool is 0.9 times the Neon compute's `max_connections`.
  `max_connections` is 112 at 0.25 CU, 225 at 0.5 CU, and 450 at 1 CU.
  Lower the replica count or `DATABASE_POOL_MAX` until the connection pools fit.
  `isUniqueViolation` is true if an error is Postgres rejecting a duplicate key.
- `redis.ts` — the Redis store, on Bun's built-in client from `REDIS_URL`.
  `runWithRedis` runs one operation and returns null on any failure,
  and `cacheJson` returns a cached value, or loads the value and caches it.
  `incrementRateLimitWindow` is the fixed window counter behind the api's shared limiters, and `takeRateLimitSlot`
  is the slot that one call holds at a time, behind the Resend limit that the api and the worker share.
  `publishToChannel` and `subscribeToChannel` are the fan-out, and each process subscribes on one subscriber connection.
  `readAndResetRedisGauges` returns the minute line's counts.
  The store reconnects with no limit on attempts, and the reconnect delay doubles from one second up to 30 seconds.
  If an operation returns null, the caller goes on without Redis.
  Sessions read Postgres, a cache calls its loader, a limiter allows the request,
  and a Resend call goes out without a slot.
- `claim.ts` — `runWithClaim` runs the sweep and the budget reset under a database-level claim.
  The claim is a transaction-level advisory lock keyed by the claim's name.
  The lock works through the connection pooler and releases with the transaction no matter how the task ends.
  A sweep or reset that starts while the claim is held does nothing.
- `quotas.ts` — the derived per-user limits, and `loadUserAccess`, the one read of a user's role, plan, and budget
  override, which the api and the worker share.
  `monthlySpendDollars` reads a user's spend for the month on scans, chat turns, and podcast episodes.
  `isPodcastEpisodeBudgetShareExhausted` is true once that spend reaches 80 percent of the budget, which pauses episodes.
  `canRenderPodcastEpisode` allows a Topic one episode on the free plan, and any number on a paid plan or for an admin.
- `podcastFeedCache.ts` — the Redis keys of a Topic's rendered podcast feeds,
  and `deletePodcastFeedCache`, which a publish, a removal, or a rename runs.
- `requestMemo.ts` — the reads one request repeats, its user's access and each topic role, kept in the request's
  async context. The api opens a memo for every request, and outside a request every read goes to the database.
- `queryTracing.ts` — counts each statement a request sends and traces it under the request's span. A write
  statement clears the memo of the request that sent it.
- `migrate.ts` applies pending migrations, and `seed.ts` has the dev stub data behind `bun run db:seed`.
- Schema changes edit `schema.ts`, then `bun run db:generate` writes the migration (offline, no
  doppler) and `bun run db:migrate` applies it (its script already runs under doppler). Never
  hand-edit an applied migration.
- All Postgres access goes through Drizzle here; no `Bun.sql`, `pg`, or raw clients anywhere.
- This module imports nothing app-level.
- Tests: `bun test db`.

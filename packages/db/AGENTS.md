# packages/db/

`personalSourcePayloads.ts` reads encrypted items in byte-bounded batches for the private link queue and context summarization. An oversized import occupies its own batch.

`personalSourcesSend.ts` wraps multiple receiving destinations in one transaction and one accepted-send charge. Sorted destination IDs enter every retry digest; any refusal rolls back the complete batch.


`personalSourcesAiAgentRecommendations.ts` derives connected-app suggestions from the owner's live accepted sends in bounded pages. It matches description words locally and persists no index, content copy, or routing counter.

`personalSourcesAiAgentSetup.ts` adds an empty receiving Source from a verified live connection under confirmation's
lock order. It also reads and dismisses the latest consent nudge without importing content or storing assistant history.

`personalSourcesEmailSetup.ts` returns shared-address manual-forwarding guidance and receiving entitlement.
`personalSourcesEmailConfirmations.ts` stores ID-only durable handoffs, bounded retries, terminal refusals, and sweep
recovery. `resendRateLimit.ts` shares one provider slot between inbound retrieval and the existing outbound email sends.

`personalSourcesImports.ts` revalidates selected transcripts and commits an entire batch with permanent content fingerprints.
`personalSourcesContext.ts` reads bounded live excerpts and commits encrypted summaries only for the current revision.
`personalSourcesWork.ts` exposes content-free deadlines and dirty Topic IDs for Temporal and sweep recovery.
`personalSourcesLinkQueue.ts` claims bounded live links, recovers unfinished leases, and records durable review outcomes.
Only canonical URL fingerprints and positions live in queue metadata. Private sender preference is read per Topic.
`quotas.ts` includes `personal_source_distillation_spends` in monthly totals. Unknown attempts keep a conservative cost estimate.

`personalSourcesReceive.ts` accepts encrypted content, links, counters, and retry metadata in one transaction.
`personalSourcesLocks.ts` locks the sender before the Topic when filing. Competing sends and access changes wait, while
a Scan can reference both rows. `personalSourcesQuota.ts` reads the sum of accepted AI sends and email per UTC day
against one shared 200-send ceiling, including existing origin rows. `personalSourcesLifecycle.ts` owns deletion,
deadline filters, and context invalidation. `personalSourceEntries.ts` bounds sender-only pages by entry count and
ciphertext size. Numbered five-item pages derive boundaries from confirmation IDs, dates, and byte sizes and decrypt
only the selected page; existing cursor reads stay compatible; `personalSources.ts` reads live counts and concrete
connection state. `aiAgentConnections.ts` derives OAuth connections from existing grants, and `aiAgentApiKeys.ts`
creates, verifies, lists, and revokes digest-only send credentials. The development persistence smoke lives in
`apps/api/personalSources/` and runs through `bun run smoke:personal-sources`.

Personal sources migrations establish the existing Topic/Source composite unique keys before creating the Personal sources tables.
The new context table uses an inline composite unique constraint so its foreign keys can be created in the same
migration. Personal sources migrations are generated with `bun run db:generate`. The receiving schema uses two final-schema migrations: prerequisites first, then the receiving tables. The additive Finding bonus migration stores a constrained personal-source score bonus for stable re-scoring. Development adopts that chain after a content-preserving schema reconciliation; released migrations stay unchanged.

`@carlnotes/db`: Drizzle + Neon Postgres, the Redis store, and object storage, every store the app writes to.
`@carlnotes/emails`, `models`, and `pipeline`, `apps/api`, and `apps/worker` import it; it imports `@carlnotes/server`
and `@carlnotes/contracts`, with `drizzle-orm` and `@neondatabase/serverless`.

- `schema/` — the schema, one file per domain: `users.ts` (users and Better Auth's tables), `topics.ts`, `scans.ts`
  (scans, resources, findings, and the finding markers), `topicEmailSends.ts` (the emails a Topic sent), `teams.ts`,
  `teamTopics.ts` (the topics shared into a team beyond its owning team), `invites.ts`, `chat.ts`, `notes.ts`,
  `podcast.ts`, `billing.ts` (each user's one billing subscription and the provider that bills it), `releases.ts`,
  `jobLeases.ts` (each job's lease row), `storage.ts` (favicons and the pending object deletions),
  `mobileMinimumVersions.ts` (the minimum app version of each platform), `reports.ts` (content reports), `userBlocks.ts`
  (the users a user blocked), `social.ts` (reactions, comments, the users a comment mentions, and the links of a comment
  shared with the podcast, each row on exactly one social target), `notificationsEmailSends.ts` (one row per user per
  UTC day that a notifications email went out), `pushDevices.ts` (each phone's Expo push token, bound to the session
  that registered it so ending the session or closing the account deletes it, and the push sends the push service
  accepted, one per event, recipient, and phone, with each receipt, indexed by phone and recipient for the cascades),
  `viewerCounts.ts` (the saved HyperLogLog counter of each topic's viewers and each podcast episode's listeners),
  `vectors.ts` (the topic and podcast episode vectors that rank related topics, related podcast episodes, and the
  podcast episode search, each table kept apart from the row it ranks so a read of a whole row never includes a vector,
  and each table's public and shown flag with its partial HNSW index), and `columns.ts` (the pgEnums and the column
  helpers they share). A table references another file's table through a lazy `references`, so the files import each
  other freely. `index.ts` spreads every file into the one `schema` object the client is bound to.
- `index.ts` — the pooled client, the connection pool's counts, `sizeConnectionPool`, `isUniqueViolation`, and the
  `DbTransaction` and `DbHandle` types that a function sharing its caller's transaction takes. Each long-running
  process, the api, the Temporal worker, the sweep, and the budget reset, awaits `sizeConnectionPool` at startup. It
  reads `SHOW max_connections` and sizes the pool to 0.9 times that value, the share Neon's connection pooler holds on
  its server side for one user and database, divided by the pool count, how many processes can hold a pool at once: 8 by
  default, or `DATABASE_POOL_COUNT`. `DATABASE_POOL_MAX` sets the size itself instead. Until the read completes, and if
  it fails, the pool holds 15 connections, and a failed read is reported. A process with no `DATABASE_URL`, such as a
  test, keeps the default and reads nothing. The size is logged at startup. A request waiting for a connection fails
  after `DATABASE_CONNECT_TIMEOUT_MS`, 10 seconds by default. A short-lived job keeps the default. If
  `DATABASE_WS_PROXY` is set, `configureWebSocketProxy` sends every connection through that Neon WebSocket proxy with
  TLS off, which only the image smoke test does. `isUniqueViolation`
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
- `viewerCounts.ts` — a topic's viewers and a podcast episode's listeners, one Redis HyperLogLog each, named by a
  `ViewerCountRef`. `addViewer` adds one person and lists the ref as changed if the counter grew, `readViewerEstimate`
  reads the estimate, `takeChangedViewerCountRefs` takes the changed set for the worker's sync, and
  `restoreViewerCounters` rebuilds Redis from Postgres, merging the saved counters back and adding the seeded signed-in
  people, marked by `viewer-counts:restored`. Each goes through `runWithRedis`, so a Redis failure loses a count and
  never fails a request.
- `memoryRateLimitWindows.ts` — the rate limit windows a process counts in memory while Redis cannot count them,
  bounded by expiry and by a limit of 10,000 keys, the oldest evicted first. A memory count is never written to Redis.
- `jobLease.ts` — `runWithJobLease` runs the sweep and the budget reset under a job lease.
  The lease is a row in `job_leases`, keyed by the job's name, taken in one statement that inserts the row or
  takes over an expired one. The run renews the two-minute lease every 30 seconds by the database clock, and deletes
  its own row when the task ends, however it ends. No transaction stays open between statements.
  A renewal that finds the lease expired or taken aborts the signal the task receives, and the run rejects with a
  `JobLeaseLostError`. A process that dies leaves a lease that expires on its own.
  A sweep or reset that starts while another run's lease is live does nothing and returns null.
- `topicImages.ts` — a topic's image row and its urls, one read per topic or for a list of them. `schema/topicImages.ts`
  holds `topic_images` and `topic_image_renders`, and `topics.image_hash` copies the current hash.
- `homeOrder.ts` — a row's home order on the home page, generic over topics and podcast episodes:
  `setHomeOrder` puts a row at a position inside the caller's transaction and `releaseHomeOrder` clears one and
  closes its gap. `podcastEpisodeHomeOrder.ts` wraps it for one podcast episode and for every podcast episode of a topic that leaves
  the public set.
- `quotas.ts` — the derived per-user limits, and `loadUserAccess`, the one read of a user's role, plan, budget
  override, and admin block, which the api and the worker share.
- `inviteLimits.ts` — the daily invite limit. `toAccountSignalWeight` is the age and reputation factor that the invite
  limit and a Finding's reaction signal share.
- `socialLimits.ts` — `countSocialWriteToday`, the flat daily count of an account's reaction saves and comment posts and
  edits in Redis, and `loadAccountSignalWeights`, each account's signal weight in two reads.
- `sharedComments.ts` — the comments a Topic's editors share with the podcast: the shared comment slots a Topic has for
  its next Podcast Episode, the share under a per-Topic advisory lock and its taking back, the links a shared comment
  queues in `comment_links`, what a Scan's scoring context and a Podcast Episode's script read, and the mark that frees
  a shared comment slot once a script read the comment. `monthlySpendDollars` reads a user's spend for the month on
  scans, chat turns, and podcast episodes, once per request through the request memo. `hasFullPodcastEpisodes` is true
  on a paid plan or for an admin, and the free plan gets short podcast episodes.
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
- `redisFakeViewerCounts.ts` — the viewer count commands that the fake server and the client stub both handle: the add
  and take scripts, `PFADD`, `SADD`, `PFCOUNT`, `PFMERGE`, `EXISTS`, and the counter read, each counter held as an exact
  set.
- `redisFakeSpendReservations.ts` — the spend reservation commands that the fake server and the client stub both
  handle: the reserve script and `ZREM`, each sorted set held as its members and their scores.
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
- `contentFilters.ts` — the read filters that decide what one user sees: `toNotUserBlockedAuthorFilter` for rows by a
  user they blocked, `toUnreportedFilter` with `OPEN_OR_CLEARED_REPORT_FILTER` for subjects they reported, and
  `toTopicRoleFilter` for the topics they own or a team of theirs holds, and `toTeamHoldsTopicFilter` for whether a
  team owns a topic or holds a share of it. Reactions and comments use `toNoUserBlockBetweenFilter`, which hides an
  author in a user block with the user in either direction, `toNotAdminBlockedAuthorFilter`, and `hasUserBlockBetween`.
  `toVisibleAuthorFilter` joins the two filters for `commentRows`, `reactionRows`, `sharedComments`, and
  `reactionSignals`. Each takes its ids or columns, so the api's reads and the pipeline's topic scan email and push
  recipients import the one copy.
- `inviteFilters.ts` — `loadUserEmail`, `toInviteAddressedToUserFilter` (the invitations addressed to a user by
  account or verified address), and `toPendingTopicInviteFilter` (the topic invitations still waiting for an answer).
- `noteBadges.ts` — the unread edit and comment counts on each note a user may see, `loadBadgedPages` (their teams and
  the topics those teams hold), `loadPageNoteBadges` for pages already loaded, and `saveNoteRead`, the read time that
  clears them.
- `updateCounts.ts` — `loadUpdateCount`, a user's unseen chat mentions, unread note edits and comments, and pending
  topic invitations summed as the apps' update count, which each push sets as the app icon badge, and
  `toUnseenChatMentionFilter`, which the api's chat mention reads share.
- `pushDevices.smoke.ts` (`bun run smoke:push-devices`) — inside one rolled-back transaction, proves that ending a
  session or closing the account deletes its push devices, that a repeated send for one event, recipient, and phone
  breaks the unique index, that a send whose event does not match its kind fails the check, and that retiring a phone
  keeps its sends with no phone.
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

`authorization.ts` owns the shared capability gate. `topicPermissions.ts` and `findingPermissions.ts` supply its
existing visibility, subscription, and collection grant rules; the API keeps compatibility exports.
`personalSourcesAuthority.ts` adds the sender isolation within normal Topic edit authority and preserves cleanup after
downgrade. `schema/personalSources.ts` stores encrypted Personal sources items, derived context and lasting activation,
queue claims, retry identities, daily confirmation counters, API-key digests, encrypted private annotations and pending
replies, durable mail confirmations, and summarization spend. Composite references keep each entry's Source, Topic, and
sender consistent.

`store.ts` exports the podcast audio URL lifetime beside its signer so the API reports the same expiry it signs.

`topicSourceCapacity.ts` enforces the ten fetched Sources under the Topic lock. Personal sources do not count toward that limit.

`personalSourcesMigration.ts` assigns legacy Sources to their original sender and encrypts legacy generated explanations/reports before clearing shared text. `db:migrate` runs it after generated schema migrations. `findingPersonalAnnotations.ts` reads annotations by authenticated sender and current Finding visibility. Context and receiving Source identity are per (Topic, sender); edit authority permits contributions but never widens private reads.

Email confirmations retain replay identity and temporary encrypted reply snapshots. `personalSourcesEmailChoices` stores
provider/thread references and encrypted Topic choices only, without email bodies. Sender-owned choices support
same-thread number/name replies, disappear after successful selection, and cascade on account deletion.

`personalSourceEntries.ts` also reads bounded waiting links for a send confirmation after Topic authority, exact
entry/Topic/sender matching, send-origin, and retained-entry checks. It reuses durable link outcomes and stored page
titles.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain labels.

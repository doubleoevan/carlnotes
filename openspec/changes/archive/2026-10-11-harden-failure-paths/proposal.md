## Why

Nine failure paths each lose something quietly today: a Redis outage turns every request limit off, a forgotten pool
recalculation queues queries at Neon's pooler, a failed R2 delete leaves an object nobody can find, a broken cache key
ships unseen, a chat message published during a Redis drop stays hidden, two api replicas show two homepage orders, a
deleted avatar stays at the edge for a day, a large or HEIC photo fails to upload, and topic search can come back short
with no error. This change closes each one, with a spec delta and a task group per part.

## What Changes

**Part 1: Request limits stay bounded while Redis is down.** `incrementRateLimitWindow` in `db/redis.ts` counts a hit
Redis could not count in the replica's own memory, under the same key, limit, and window, so every limiter built on it
is bounded at the limit times the replica count during an outage. The callers are the per-caller limiter in
`api/rateLimit.ts`, the daily suggestion limit in `db/quotas.ts`, the daily flag limit in `api/flagContent.ts`, and
Better Auth's credential limits through the secondary storage's `increment` in `api/auth.ts`. Today the credential
limits are off while Redis is down: Better Auth's `consume` compares the count that `increment` returns against the
rule's `max`, and the storage returns zero for a hit Redis could not count, so every attempt passes. The counter no
longer returns null, so the null branches in its callers go. Memory counts are never written back to Redis, expired
windows are evicted, and the number of tracked keys is limited. The one outbound throttle on `takeRateLimitSlot`, the
Resend slot in `worker/email.ts`, stays as it is. It bounds the send rate and gates no spend. Monthly spend limits stay
in Postgres and LiteLLM and are out of scope.

**Part 2: The database pool is sized from the database.** At startup each long-running process reads `SHOW
max_connections` and sizes its pool to 0.9 times that value divided by the pool count, the number of processes that can
hold a pool at once. The pool count is a constant in `db/index.ts`, 8 by default: two api replicas, two worker replicas,
the sweep, the budget reset, and two for the replicas a rolling deploy overlaps with and the release jobs.
`DATABASE_POOL_COUNT` overrides it if the replica count changes, and `DATABASE_POOL_MAX` stays as an override of the
size itself. A failed read keeps a default of 15, the size a 0.25 CU compute allows, and reports the failure. The
computed size is logged at startup. Both databases report `max_connections` 901 today, which sizes each pool to 101. The
pool rule in `db/AGENTS.md`, `.env.example`, and the request-capacity spec is rewritten as current state.

**Part 3: R2 object deletes are guaranteed by an outbox.** A `pending_object_deletions` table records each key in the
same transaction that deletes or fails the row that named it. The inline delete stays, and a success removes the pending
row. The scheduled sweep retries leftover keys with backoff, outside its claim, counts a missing object as deleted, and
reports to Sentry once a key has been pending for a day. One delete path, `deleteStoredObject` in `worker/store.ts`,
replaces `deleteAttachment` and `deleteResourceContent`, and nothing calls `bucket().delete` directly. Topic deletion
and chat attachment clearing flip to record keys and delete rows first, then delete objects. Podcast publish and removal
record keys inside their transactions and delete after the commit. Avatar replacement reads the previous key and writes
the new one in one transaction. Account deletion records the account's chat attachment and avatar keys in the
transaction that deletes the user row. An upload whose row insert can fail records its key before uploading, with a
grace period the sweep waits out, and clears it in the insert's transaction. Resource content stays out of the outbox.

**Part 4: Query and cache counts show while building.** In dev and tests the api counts each request's Redis cache hits
and misses beside its statement count, logs one line per request with the method, route pattern, status, duration,
queries, hits, misses, and in dev the keys that missed, and sends a `Server-Timing` header with the same numbers.
Production keeps Sentry only. Query budget tests cover the cached routes: `GET /api/rooms/mention-count` and `GET
/api/topics/:id?poll=1` read through `cacheJson`, `GET /api/topic-feed` reads the section order through it after Part 6,
and `GET /api/topics/:id` reads its user's access and topic role once through the request memo.

**Part 5: Chat streams catch up after Redis reconnects.** The Redis store tells its callers when the subscriber
connection has come back after a drop, and every open chat room stream on that instance re-reads past its cursor once.
The cursor model stays, with no sequence numbers and no client change.

**Part 6: The topic section order is shared across replicas.** The featured and popular id lists move from a per-process
variable in `api/topic/feeds.ts` to `cacheJson` with the same 60-second lifetime. Every featuring change, including a
release of a feature order, deletes the shared key. With Redis down the lists load from Postgres on each request.

**Part 7: Deleted avatars are purged from the edge.** User avatar responses are tagged `user-avatar:<userId>` and team
avatar responses `team-avatar:<teamId>`. The purge takes any tags, and the release purge keeps clearing `rendered`.
After an account or team deletion commits, the api purges that tag once. A failed purge is reported, a skipped one is
logged, and neither fails the deletion. The api service runs under the same Doppler config as the purge job, and that
config holds `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` already, so no manual step is needed.

**Part 8: Avatar uploads succeed for large photos.** Every upload is the resized re-encode, a JPEG for a photo and a
PNG for a PNG, WebP, or GIF source so a transparent logo keeps its clear background, and an unprocessed original is
never sent. A file of a megabyte or more decodes 512 pixels wide. A HEIC file the browser cannot decode is
decoded by a HEIC decoder loaded only then. A file that could not be decoded or resized shows a message before anything
uploads and is reported with its content type and byte size. The team avatar chooser goes through the same path.
Chromium confirms the HEIC failure: it rejects a HEIC file from both `createImageBitmap` and an image element, so a
HEIC pick in Chromium without this change uploads the original and fails with the wrong message. Chromium does not
show the large-photo failure: a 48-megapixel JPEG decodes in desktop Chromium in under a second at full size and at
512 pixels, so that failure is confirmed only as the mobile memory limit the desktop cannot show. Server limits stay
as they are.

**Part 9: Search is complete and indexed.** Topic-scoped ranking in `worker/chat/retrieve.ts` filters to the topics'
findings in a materialized common table expression and ranks that set by distance, so the planner never uses the global
HNSW index for it. The duplicate check in `worker/review/filter.ts` keeps the index. A migration enables `pg_trgm` and
adds trigram GIN indexes on `users.username_normalized`, `lower(teams.name)`, and `lower(topics.name)`. The search bar
searches topic names on the server through a new route that applies the `topic:view` rules in SQL, including the minimum
shown findings for other people's public topics, and gives a visitor public topics only. Finding matches stay as they
are.

**Part 10: A fetch of the unsubscribe link unsubscribes nobody.** The topic-scan email's unsubscribe link performed the
unsubscribe on a plain GET, so a mail provider or a security scanner that fetched the link to check it unsubscribed the
recipient. Sentry showed two such fetches on one recipient's link inside a second, an hour and forty minutes after
delivery, with no visit to the site. The link now opens a page naming the Topic with one button, the button posts the
unsubscribe, a provider's RFC 8058 one-click post keeps working, and the `email_unsubscribed` event names which of the
two performed it with the request's device properties.

## Capabilities

### New Capabilities

- `stored-object-deletion`: `deleteStoredObject`, the pending deletions table, the sweep's retries,
  and which writes record a key

### Modified Capabilities

- `redis-store`: the fixed-window counter counts in memory while Redis is down, and the store reports a subscriber
  reconnect
- `mcp-server`: the per-caller limiter is bounded per replica while Redis is down
- `user-auth`: the sign-in limiter is bounded per replica while Redis is down
- `content-reporting`: the daily flag limit is bounded per replica while Redis is down
- `source-suggestion`: the daily suggestion limit is bounded per replica while Redis is down
- `request-capacity`: the pool is sized from `max_connections` at startup, and name searches use trigram indexes
- `deploy-mechanics`: a replica count change sets the pool count, and the api keeps no per-process cache
- `topic-attachments`: a failed attachment's object delete is guaranteed through the outbox
- `account-closing`: the keys of everything an account owned are recorded before the account goes
- `performance-telemetry`: dev and tests show each request's queries and cache reads, with query budgets
- `topic-scan-email`: the unsubscribe link opens a page with a button, and only the post unsubscribes
- `monitoring-analytics`: `email_unsubscribed` names the page or the one-click as its entry point
- `team-chat`: an open stream catches up after the subscriber reconnects
- `feed-homepage`: the featured and popular order is shared across replicas, and the search bar finds topics by name on
  the server
- `edge-caching`: avatar responses are tagged, and a deletion purges its tag
- `user-avatars`: every upload is the browser's resized re-encode, with HEIC decoded on demand
- `topic-chat`: topic-scoped retrieval ranks exactly, without the HNSW index

## Impact

- `db/`: `redis.ts` gains the memory fallback and the reconnect hook, and a new `memoryRateLimitWindows.ts` holds the
  memory windows. `index.ts` gains `sizeConnectionPool`. `schema.ts` gains `pending_object_deletions` and three trigram
  indexes, with two migrations, one enabling `pg_trgm`. `queryTracing.ts` counts cache reads beside queries.
- `api/`: `rateLimit.ts`, `auth.ts`, `flagContent.ts`, and `db/quotas.ts` drop their null branches. `index.ts` sizes the
  pool and mounts the dev request line. `requestTracing.ts` logs the line and sets `Server-Timing`. `avatars.ts`,
  `users.ts`, `team/deleteTeam.ts`, `chat/attachments.ts`, `chat/roomDeletes.ts`, `topic/attachments.ts`, and
  `topic/deleteTopic.ts`
  record keys and delete through `deleteStoredObject`. `edgeCache.ts` takes the purge and the avatar tags.
  `topic/feeds.ts` and `topic/featuring.ts` share the topic section ids. `chat/roomStream.ts` catches streams up. A new
  `topic/search.ts` serves `GET /api/topics/search`, and `searchPlans.smoke.ts` checks the search plans.
- `worker/`: `store.ts` holds `deleteStoredObject` and the recording. A new `retryPendingObjectDeletions.ts` holds the
  sweep's retries, run from `schedule.ts` outside the claim. `attach.ts`, `workflows/processAttachmentActivities.ts`,
  `podcast/publishPodcastEpisode.ts`, `podcast/removePodcastEpisode.ts`, `review/score.ts`, and `ingest/index.ts` call
  it. `temporal.ts`, `schedule.ts`, and `resetMonthlyBudgets.ts` size their pools. `chat/retrieve.ts` ranks exactly.
- `ui/`: `components/avatar/AvatarUpload.tsx` and the two pickers take the new decode path, with the report sent
  through `clients/profileClient.ts`, and `components/search/SearchBar.tsx` and `components/search/SearchResults.tsx`
  show the topic matches that `clients/topicClient.ts` fetches.
- Dependencies: one HEIC decoder package, loaded by dynamic import only for a HEIC file. The project is AGPL-3.0, so
  libheif's LGPL build is compatible.
- Docs: `db/AGENTS.md`, `api/AGENTS.md`, `worker/AGENTS.md`, `ui/AGENTS.md`, `.env.example`, and the README's Redis and
  process paragraphs.
- Manual deploy steps: none. `DATABASE_POOL_MAX` is unset in Doppler prd, so the computed size takes over on deploy, and
  the Cloudflare settings are already in the config every service runs under.

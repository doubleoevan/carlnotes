## Context

The Redis store in `db/redis.ts` returns null for any failed operation, and every caller goes on without Redis. For the
four request limits that count there, going on means allowing the request: the per-caller limiter's store returns zero
hits, `isWithinRateLimit` treats null as within the limit, and Better Auth's `consume` compares the zero that the
secondary storage's `increment` returns against its `max`. The database pool is sized by `DATABASE_POOL_MAX` with a
default of 40, and the rule for picking that number lives in prose that lists Neon's old `max_connections` values. Both
databases report 901 today. R2 deletes go through `deleteAttachment`, which logs and swallows, and
`deleteResourceContent`, whose callers add `.catch(() => {})`. The per-request query count only runs if Sentry
records the request, so it never shows in dev. Cache hits and misses count per minute per process. The subscriber
connection resubscribes its channels on reconnect and tells nobody. The topic section order sits in a per-process
variable. Avatar images get no cache tag. The avatar upload falls back to the original file if the browser's decode
fails. Topic ranking orders on `resources.embedding`, which the global HNSW index can serve, and the name searches use
`LIKE '%q%'` with no trigram index. The search bar matches topic names against the loaded home feed.

Constraints: Bun and Drizzle only. One `package.json`. `bun test` runs offline with the connection pool stubbed and no
Redis, so anything that needs a database or a bucket is a smoke test under Doppler. Neon's pooler runs in transaction
mode. The ui tests render without a DOM, so a browser-only path is tested by stubbing its globals. The project is
AGPL-3.0.

## Goals / Non-Goals

**Goals:**

- Every Redis-counted request limit stays bounded per replica during a Redis outage, and never fails closed.
- Each long-running process sizes its own pool from the database, with one constant for the pool count.
- No stored object outlives the row that named it, whatever fails, with one delete function, `deleteStoredObject`.
- A developer sees each request's queries and cache reads in the terminal and in devtools, and a budget test fails if
  a cached read is bypassed.
- An open chat stream misses nothing across a subscriber drop.
- Every api replica serves one section order.
- A deleted avatar leaves the edge at once.
- An avatar upload is always the browser's small re-encode, HEIC included.
- Topic-scoped ranking is exact, name searches read by index, and the search bar finds any topic the user may see.

**Non-Goals:**

- Monthly spend limits, which stay in Postgres sums and LiteLLM key budgets.
- The outbound Resend throttle on `takeRateLimitSlot`, which bounds a send rate and gates no spend.
- Replaying pub/sub messages, sequence numbers, or any client change to the stream protocol.
- The note stream's catch-up after a reconnect. The hook is generic, and the note stream can take it later.
- Purging share previews, podcast covers, chat room preview images, or browser caches.
- Server-side image processing. The server keeps its 2 MB limit and its type check.
- A finding search on the server. Finding matches stay from the loaded feed.
- R2 lifecycle rules, which match by prefix and age and cannot be lifted from one object.

## Decisions

### Part 1: the counter itself falls back, so every caller is covered at once

The memory fallback goes inside `incrementRateLimitWindow` and `decrementRateLimitWindow` in `db/redis.ts`, with the
memory windows in a new `db/memoryRateLimitWindows.ts`: a `Map` from key to `{ count, resetAt }`, an `increment(key,
windowMs)` that evicts an expired entry on the way, a `decrement(key)`, and a key limit of 10,000 past which the
oldest-inserted entry is dropped before the new key is added. The counter's return type loses its null: a hit that Redis
could not count is still a hit with a count. `isWithinRateLimit` takes a hit, the limiter store in `api/rateLimit.ts`
loses its zero-hits branch, `incrementDaySuggestionCount`, `canFlag`, and the secondary storage's `increment` in
`api/auth.ts` lose their null handling, and the "a hit Redis could not count is allowed" comments go.

Why here: four callers, one root. A fallback per caller would be four copies, and Better Auth's caller is a storage
adapter the app does not own the logic of. Why not keep the null and let callers decide: nothing would decide
differently. Why evict the oldest key on overflow instead of returning null: returning null is the fail-open hole the
part closes. Evicting an old window gives its caller one fresh window at worst, which is the same bound a reconnect
gives. Why not write memory counts back to Redis: two replicas' memory counts would double-count on the way back, and
the first Redis-counted hit after an outage is a clean start.

### Part 2: the pool is sized after construction, by the processes that hold one for long

`db/index.ts` keeps constructing `connectionPool` at import with the default size, now 15, and gains
`sizeConnectionPool()`: it runs `SHOW max_connections` through the pool, computes `Math.max(1, Math.floor(0.9 *
maxConnections / poolCount))`, and sets `connectionPool.options.max`. `pg-pool` reads `options.max` on every checkout,
so the change takes effect for the next connection. `DATABASE_POOL_MAX` wins over the computed size if it is set, and
`DATABASE_POOL_COUNT` overrides the constant `DEFAULT_POOL_COUNT = 8`. The function logs one line naming the size, the
`max_connections` it read, and the pool count, and on a failed read keeps the default and calls `reportError`. A process
with no `DATABASE_URL`, such as a test, keeps the default and reads nothing, so a test that imports the api entry never
opens a socket. It is awaited at startup by `api/index.ts` before the server exports its fetch handler, by
`worker/temporal.ts` before the workers start, and by `worker/schedule.ts` and `worker/resetMonthlyBudgets.ts` before
their claimed work. `db/migrate.ts` and `worker/docsSync.ts` keep the default: both run for seconds at a release.

Why a default of 15: it is the size a 0.25 CU compute allows with eight pools, so a process whose read failed can never
oversubscribe the pooler. Why 8 as the pool count: two api replicas, two worker replicas, the sweep, and the budget
reset make six, and a rolling deploy runs old and new api replicas at once while the migration and docs jobs hold their
own short pools. Why a constant with an env override: the number changes only with the replica count, which is a
platform decision, and the read covers the number that changes with the compute size. Why not construct the pool
after the read: `db` is imported at module load across the api and the worker, and a top-level await in `db/index.ts`
would send a real query from every test file that imports it.

With `max_connections` 901 the computed size is 101, well above the 40 of today. At 0.25 CU it would be 11, below the
twelve queries a signed-in feed request sends at once, and that request queues inside its own pool instead of failing.

### Part 3: an outbox table, `deleteStoredObject`, and the sweep's retries outside the claim

`pending_object_deletions`: `object_key text primary key`, `recorded_at`, `next_try_at` (defaults to now, and the grace
period sets it later), `attempt_count integer default 0`, `last_error text`, `reported_at`. No foreign keys, so no
cascade ever removes a pending row.

`worker/store.ts` exports `deleteStoredObject`, and nothing else deletes:

- `recordPendingObjectDeletions({ handle, objectKeys, nextTryAt? })` inserts the keys in batches of 500 with
  `onConflictDoNothing`, on the caller's transaction handle (`DbHandle`).
  `recordPendingObjectDeletionBeforeUpload(key)` records one key before an upload with the hour's grace period.
- `deleteStoredObject(key)` tries `bucket().delete(key)`. On success it deletes the pending row. On failure it logs,
  writes the error and raises the attempt count on the pending row if one exists with the next try pushed back, and
  returns false. It never throws, a failed pending row write included. `deleteStoredObjects(keys)` runs it ten at a
  time.
- `clearPendingObjectDeletion(key, handle)` deletes the pending row inside the transaction that writes an uploaded
  object's row, and `toStoredObjectKeys(rows)` keeps the keys among rows whose key may be null.

`deleteAttachment` and `deleteResourceContent` are renamed into `deleteStoredObject`. Resource content calls
`deleteStoredObject` with no pending row recorded, and the `.catch(() => {})` wrappers go, since the function does not
throw.

Call-site shape, in `api/users.ts`, `api/team/deleteTeam.ts`, `api/avatars.ts`, `api/chat/attachments.ts`,
`api/chat/roomDeletes.ts`, `api/chat/roomAttachments.ts`, `api/topic/attachments.ts`, `api/topic/deleteTopic.ts`,
`worker/attach.ts`, `worker/workflows/processAttachmentActivities.ts`, `worker/podcast/publishPodcastEpisode.ts`, and
`worker/podcast/removePodcastEpisode.ts`:

```ts
// record the keys and delete the rows in one transaction, then delete the objects
const objectKeys = await db.transaction(async (transaction) => {
	const keys = await selectKeys(transaction)
	await recordPendingObjectDeletions({ handle: transaction, objectKeys: keys })
	await deleteRows(transaction)
	return keys
})
await deleteStoredObjects(objectKeys)
```

`deleteTopic` selects its attachment, chat attachment, room attachment, and podcast keys inside the transaction, the
podcast keys from each episode's id and its script's chapter count before anything clears the script, then releases the
feature order and deletes the row. `deleteChatAttachments` and `clearChatRoom` flip the same way.
`publishPodcastEpisode` records the chapter keys in its publish transaction and the replaced short episodes' keys in the
same transaction, where their scripts are still readable, and deletes after the commit. `removePodcastEpisode` records
inside `markPodcastEpisodesRemoved`'s transaction. `uploadAvatar` and `uploadTeamAvatar` record the new key with the
hour's grace before uploading. `replaceAvatar` and the team upload's transaction then read the previous key with `select
... for update` on the row, record it, write the new key, and clear the new key's pending row, and the previous object
is deleted after the commit. `deleteTeam` and the solo team delete in `deleteUser` share `deleteTeamRow` in
`api/team/deleteTeam.ts`, which deletes the team's chat room attachment rows, records their keys and the avatar key, and
deletes the team row on the caller's transaction. `deleteUser` wraps the chat attachment key read, the avatar key read,
the recording, and the user row delete in one transaction, then deletes the objects. `ingestAttachment` and
`storeTopicChatAttachment` record their key with a `next_try_at` one hour out before uploading, clear it in the row
insert's transaction, and on a failed insert delete through `deleteStoredObject`. `failAttachment` records the key in a
transaction with its status update.

`worker/retryPendingObjectDeletions.ts` exports `retryPendingObjectDeletions()`: it selects pending rows whose
`next_try_at` has passed, oldest first, limited to 200 per sweep, deletes each through `deleteStoredObject`, and on a
failure sets `next_try_at` to now plus `2 ^ attempt_count` minutes, at most a day. A row recorded more than a day ago
with no `reported_at` is reported to Sentry once and marked. `worker/schedule.ts` calls it after
`runScheduledTopicScans` returns, so the claim's transaction has ended, and the dev loop calls it on every interval.

Why keep the inline delete: deletes happen as fast as today, and the table only ever holds what failed. Why retry
outside the claim: a claim transaction stays open while its task runs, and a bucket call inside it would hold a pooler
connection for the call's length. A duplicate retry from an overlapping sweep is a second delete of a gone object, which
succeeds. Why record before the upload for attachments: the row insert is what can fail, so there is no row change to
share a transaction with, and a crash between the upload and the insert has nothing else to catch it.

### Part 4: the dev line and the header sit in the request context the statement count already uses

`db/queryTracing.ts` gains `cacheHitCount`, `cacheMissCount`, and `missedKeys` on its request store, with
`countCacheRead({ isHit, key })` that `cacheJson` calls beside its minute gauges, and `readRequestCounts()` returning
the counts. `traceRequest` in `api/requestTracing.ts` runs `runWithQueryCount` for every request outside production,
Sentry or not, records the start time, and in `finally` names the transaction if Sentry is recording and, outside
production, logs the line and sets the header. The switch is `Bun.env.NODE_ENV !== "production"`, which the Dockerfile
sets and dev and `bun test` leave unset or `test`. The header goes out everywhere but production, and the line is
logged in dev alone, so the test output stays quiet.

The line: `GET /api/rooms/mention-count 200 12ms queries=1 hits=1 misses=0`, with `missed=<key>,<key>` appended in
dev. The header: `Server-Timing: total;dur=12, queries;desc="1", cache-hits;desc="1", cache-misses;desc="0"`.
Devtools show each entry's name, duration, and description. The query budget tests live beside each route's tests:
`stubConnectionPool` returns the rows each query needs, `setRedisClientBuilder` installs a fake client holding a
`Map`, the test requests the route twice, and asserts the cache hit request's recorded query count is at or under the
route's maximum, a constant the test names.

Why `NODE_ENV`: the image sets it, nothing else reads it, and it needs no new setting. Why not a log file: the line is
for a terminal and a test runner. Why count in `queryTracing.ts` and not `redis.ts`: the request context is the query
tracer's, and `redis.ts` imports nothing app-level today beyond `@shared`. `queryTracing.ts` is in `db/`, so the import
stays inside the module.

### Part 5: a reconnect hook on the store, one catch-up emit per open stream

`db/redis.ts` gains `addSubscriberReconnectListener(listener)`. The subscriber connection's `onConnected` runs the
listeners after it has subscribed every channel, if the connection had connected before in this process.
`setRedisClientBuilder` forgets the listeners with the handlers. `api/chat/roomStream.ts` registers one listener on its
first subscribe, and the listener emits a catch-up notification on every event name the emitter holds. Each stream's
handler already chains a `loadChatRoomDeltas(topicId, teamId, cursor, chatMessageId)` call per notification. The
catch-up passes zero as the notified id, which no stored message has, so the dedupe key is shared across the instance's
streams of one room, and the load returns everything past the cursor once per stream.

Why not resubscribe-time replay: there is nothing to replay. Why not the note stream too: nobody asked, and the hook
makes it a two-line addition later.

### Part 6: the section ids become one `cacheJson` key

`readPublicSectionTopicIds` reads `cacheJson({ key: "topic-section-ids", ttlMs: 60_000, load })`, the per-process
variable and its `loadedAt` go, and `clearTopicSectionIdCache` becomes `deleteRedisKey("topic-section-ids")`, called by
`setTopicFeatureOrder` and by `releaseFeatureOrder`, which today changes the order without clearing anything. The
README's Redis paragraph names the section ids beside the mention count and the topic page poll.

### Part 7: the purge moves into `edgeCache.ts` and takes tags

`purgeEdgeCacheTags({ tags, zoneId, apiToken }, sendPurgeRequest)` moves from the script into `api/edgeCache.ts`, and
`api/edgeCache.purge.ts` keeps its main block calling it with `["rendered"]`. `toUserAvatarCacheTag(userId)` and
`toTeamAvatarCacheTag(teamId)` set the `Cache-Tag` header in `serveAvatar`'s two callers. `deleteUser` purges the user
tag after its transaction commits, in the branch that returns `"deleted"`, and `deleteTeam` purges the team tag after
its transaction, beside the avatar delete. Each reads the two settings from `Bun.env`, calls `reportError` on a failed
result, and logs a skipped one, which every environment without the settings has. The api runs under the same Doppler
prd config as the purge job, and that config holds both settings today, so the api reads them with no change.

### Part 8: one decode chain, a lazy HEIC decoder, and a message before any upload

`toUploadableAvatar` in `ui/src/components/avatar/AvatarUpload.tsx` returns `{ status: "ready", resizedAvatarFile } |
{ status: "undecodable" }` and never the original. The chain:

1. `createImageBitmap(file, { imageOrientation: "from-image" })`, with `resizeWidth: 512, resizeQuality: "high"` added
   for a file of a megabyte or more. A width alone keeps the aspect ratio, so a large file's bitmap is 512 wide and the
   canvas pass below brings a portrait's height to 512, and a 48-megapixel photo never needs its full bitmap.
2. If that rejects and the file's type or extension says HEIC or HEIF, `await import("heic-to")` and ask
   `heicTo({ blob: file, type: "bitmap", options })` for the bitmap with the same options.
3. If that rejects too, or the canvas has no 2d context, or the encode returns no blob, return `undecodable`.

The canvas pass draws the bitmap at the 512-pixel longest edge and encodes `image/png` for a PNG, WebP, or GIF source,
so a transparent logo's background stays clear, and `image/jpeg` at 0.85 for anything else. Either encode drops every
EXIF segment. The two pickers show "That image couldn't be read. Try a JPEG or PNG." on `undecodable` and send nothing, and
the team chooser's `onChange` goes through the same function as its drag-and-drop. Every `undecodable` result is
reported through `POST /api/avatars/decode-failures` with `{ contentType, byteSize }`, signed-in only, which calls
`reportError` on the server. The ui has no error reporter of its own. The tests stub `createImageBitmap`,
`document.createElement`, and the dynamic import, and assert each branch's result and that `undecodable` sends
nothing. The tests have no canvas, so the EXIF check and the real decode are checked by hand in the browser against
the dev server.

Why `heic-to`: it wraps libheif's wasm build, which is LGPL and compatible with AGPL, and exposes one function. Vite
splits it into its own chunk. `heic2any` is the fallback choice. Why a route for the report: adding a browser error
reporter is a new dependency and bundle weight for one event.

What Chromium confirms: it rejects a HEIC file from both `createImageBitmap` and an image element, so a HEIC pick
without this change uploads the original and the server answers "PNG, JPEG, WebP or GIF only.", the wrong message. A
48-megapixel JPEG decodes in desktop Chromium in 188 ms at full size and 420 ms at 512 pixels, so the large-photo
failure is the mobile memory limit, which the desktop cannot show. The decode at 512 pixels wide is the fix for it.

### Part 9: a materialized filter, trigram indexes, and a server-side topic search

`rankTopicFindings` runs through `db.execute` with a `sql` template: `with topic_findings as materialized (<the existing
select without the order and the limit>) select *, embedding <=> $1 as distance from topic_findings order by distance
limit $2`. The inner select stays a Drizzle query builder embedded in the template. A materialized common table
expression is an optimization fence, so the outer order sorts the filtered rows and no scan of `resources` can take the
HNSW index. The rows map through one `toRankedTopicFinding` function, since `db.execute` returns column names as the
database holds them. Drizzle 0.45 has no `materialized` option on `$with`, and Postgres inlines a single-use common
table expression without the keyword. `hasNearDuplicate` in `worker/review/filter.ts` is untouched.

The migration: `bun run db:generate` writes the three indexes from `db/schema.ts`,
`index("users_username_normalized_trgm").using("gin", table.usernameNormalized.op("gin_trgm_ops"))` and the two
expression indexes on `lower(name)`, and `create extension if not exists pg_trgm;` is added at the top of that migration
before it is applied. `pg_trgm` 1.6 is available on both databases and installed on neither.

`api/topic/search.ts` exports `searchTopics({ userId, query })` and `topicSearchRoute` at `GET /topics/search?q=`,
mounted beside the team search. The where clause, in SQL: `lower(topics.name) like '%q%'` with the pattern escaped as
`searchTeams` does, and `topics.owner_id = $user`, or `topics.team_id in (the user's active team ids)`, or `topics.id in
(team_topics of those teams)`, or `isPublicAndShown`, or `visibility = 'public' and owner_id = $user`, or `visibility =
'invite' and (an invite names the user's verified email or an active subscription exists)`. A visitor gets
`isPublicAndShown` alone. Ordered by `length(name)`, limited to 5. `SearchBar.tsx` fetches the matches through a new
`searchTopics` in `ui/src/clients/topicClient.ts` under the existing 200 ms debounce and the two-character minimum, and
keeps its finding matches from the feed.

The `explain` checks run in `api/searchPlans.smoke.ts` under Doppler, `bun run smoke:search-plans`: it runs `explain`
on the ranking query and asserts no `resources_embedding_hnsw` line, and on the three name searches with `set local
enable_seqscan = off` and asserts a bitmap scan on each trigram index. CI has no database, so the smoke runs by hand and
in the Smoke workflow.

### Part 10: the unsubscribe link opens a page

`GET /api/unsubscribe?token=` verifies the token with `readUnsubscribeTopic`, which writes nothing, and renders
`confirmUnsubscribePage`: the Topic's name, a form whose one button posts to the same url with a hidden `confirm` field,
and a link back to the Topic. `POST /api/unsubscribe?token=` runs `unsubscribe` with an entry point: `one-click` if the
form body includes RFC 8058's `List-Unsubscribe=One-Click`, which gets 200 with no body as providers expect, and `page`
otherwise, which gets the confirmation page. The event includes the entry point and the device properties from the
user agent, so PostHog tells a provider's post from a person's. The email's link and headers are unchanged.

Why a page and not a token check on the GET alone: RFC 8058 says the GET may be fetched by anything that handles the
mail, and the two fetches Sentry recorded inside one second on one link are what such a check looks like. Why keep the
POST without a session: the signed token is the authorization, as before.

## Risks / Trade-offs

- [Memory counts drift between replicas during an outage] → the bound is the limit times the replica count, which the
  requirement accepts, and memory is never written back.
- [A pool sized at startup misses a compute resize] → Neon fixes `max_connections` at the endpoint's largest size, and
  a resize restarts the compute, which restarts the pools' connections but not the processes. A process keeps its size
  until its next start. Acceptable, since a resize is rare and the deploy that follows re-reads.
- [`options.max` is set after a few connections opened] → the read is the first query, and `pg-pool` honours the new
  value on the next checkout, so at most the read's one connection predates it.
- [A pending row for a key whose object was re-uploaded] → keys are uuids, so no key is ever reused. Resource content
  is the one fixed key and stays out of the table.
- [The sweep's 200 retries per run lag a mass failure] → a bucket outage leaves thousands pending, and the sweep
  drains 200 per interval. The day-old report tells someone before that matters.
- [The dev line doubles the log volume locally] → one line per request, and the polls are the bulk. Acceptable for
  dev. Tests log no missed keys.
- [A catch-up load after a reconnect hits every open stream at once] → the dedupe key is per room per reconnect, so an
  instance sends one load per room, not per stream.
- [A purge by tag is rate-limited at Cloudflare] → one purge per deletion, which is rare. A failure is reported and
  the day-long lifetime bounds it.
- [The HEIC decoder's chunk is large] → it loads only on a HEIC pick in a browser without HEIC decoding. The user
  picker's loading state covers the wait, and the team picker shows nothing until the decode finishes.
- [A materialized common table expression is sorted in memory for a topic with thousands of findings] → a topic's
  findings read is bounded at 1,000 and review keeps about twenty, so the sort is small.
- [A two-character name search still scans] → trigrams need three characters. The two-character minimum stays, since
  users and teams are small tables and the scan is the old cost for one keystroke.
- [The topic search exposes a topic's existence by name] → the rules are the view rules, so a match is a topic the
  user may open.

## Migration Plan

1. Deploy as one release. The migration job runs the two migrations: the pending deletions table, and the extension with
   the trigram indexes. Neither locks a table for long at today's sizes.
2. `DATABASE_POOL_MAX` is unset in Doppler prd, so each process sizes its pool on its first start after the deploy.
   `DATABASE_POOL_COUNT` is unset and the default of 8 applies. Confirm the startup line in each process's log.
3. The api reads `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from the Doppler prd config it already runs under.
4. After the deploy, run `bun run smoke:search-plans` against prd to confirm the `explain` plans on real data.

Manual deploy steps: none. No new secret, no platform setting, no config change.

Rollback: a revert of the code works against the migrated database. The pending table and the indexes are inert without
their readers, and `pg_trgm` stays installed.

## Open Questions

- The replica counts in Northflank are not in the repo. If either service runs more than two replicas, set
  `DATABASE_POOL_COUNT` at deploy time. The computed size at 901 leaves room: even twelve pools get 67 each.
- None. `heic-to` 1.6.5 is the decoder, a 3.2 MB chunk that Vite splits out and the page loads on a HEIC pick in a
  browser without HEIC decoding alone.

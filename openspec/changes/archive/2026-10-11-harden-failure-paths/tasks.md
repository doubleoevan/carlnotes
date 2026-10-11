## 1. Bound request limits while Redis is down

- [x] 1.1 Add `db/memoryRateLimitWindows.ts`: a `Map` of key to count and reset time, `incrementMemoryRateLimitWindow`
      that evicts an expired entry and drops the oldest key past the 10,000 limit, and `decrementMemoryRateLimitWindow`
- [x] 1.2 Make `incrementRateLimitWindow` in `db/redis.ts` count in memory if Redis could not count, return a hit
      always, and make `decrementRateLimitWindow` refund the memory copy if Redis could not
- [x] 1.3 Drop the null branches: `isWithinRateLimit` takes a hit, the store in `api/rateLimit.ts` loses its zero-hits
      fallback, and `db/quotas.ts`, `api/flagContent.ts`, and the secondary storage in `api/auth.ts` read the count
- [x] 1.4 Tests: `db/memoryRateLimitWindows.test.ts` for eviction and the key limit, `db/redis.test.ts` for the fallback
      and for Redis's count winning once it answers, and `api/rateLimit.test.ts` for the 429 on the 31st request with
      Redis down
- [x] 1.5 Update `db/AGENTS.md`'s `redis.ts` entry and `.env.example`'s Redis comment to say a limiter counts in memory
      during an outage

## 2. Size the database pool from the database

- [x] 2.1 In `db/index.ts`, set the default to 15, add `DEFAULT_POOL_COUNT = 8` with the `DATABASE_POOL_COUNT` override,
      and add `sizeConnectionPool` that reads `SHOW max_connections`, computes the size, honours `DATABASE_POOL_MAX`,
      sets `connectionPool.options.max`, logs the line, and reports a failed read
- [x] 2.2 Await `sizeConnectionPool` at startup in `api/index.ts`, `worker/temporal.ts`, `worker/schedule.ts`, and
      `worker/resetMonthlyBudgets.ts`
- [x] 2.3 Tests in `db/index.test.ts`: the size from a stubbed `max_connections`, the override winning, and a failed
      read keeping the default and reporting
- [x] 2.4 Rewrite the pool rule as current state in `db/AGENTS.md` and `.env.example`, and add `DATABASE_POOL_COUNT` to
      `.env.example` beside `DATABASE_POOL_MAX`

## 3. Guarantee stored object deletes with an outbox

- [x] 3.1 Add `pending_object_deletions` to `db/schema.ts` and generate its migration
- [x] 3.2 In `worker/store.ts`, replace `deleteAttachment` and `deleteResourceContent` with `deleteStoredObject`,
      `deleteStoredObjects`, `recordPendingObjectDeletions` in batches of 500, and `clearPendingObjectDeletion`; export
      them from `worker/index.ts`
- [x] 3.3 Add `worker/retryPendingObjectDeletions.ts` with `retryPendingObjectDeletions`: 200 rows per run, doubling
      backoff up to a day, one Sentry report per day-old key; call it from `worker/schedule.ts` after the claimed sweep
- [x] 3.4 Flip `deleteTopic` in `api/topic/deleteTopic.ts`: select every key inside the transaction, podcast keys from
      each episode's script before anything clears it, record in batches, delete the row, then delete the objects
- [x] 3.5 Flip `deleteChatAttachments`, `deleteKeptAttachment`, and `deleteStoredChatAttachments` in
      `api/chat/attachments.ts`, and `clearChatRoom`, `deleteChatRoomAttachment`, and `deleteChatRoomMessage` in
      `api/chat/roomDeletes.ts`, to record and delete rows in one transaction, then delete objects
- [x] 3.6 Record the key in `deleteTopicAttachment` in `api/topic/attachments.ts` and in `failAttachment` in
      `worker/workflows/processAttachmentActivities.ts`, each in a transaction with its row change
- [x] 3.7 Record keys inside the publish transaction in `worker/podcast/publishPodcastEpisode.ts`, the chapter keys and
      the replaced short episodes' keys, and inside `markPodcastEpisodesRemoved`'s transaction in
      `worker/podcast/removePodcastEpisode.ts`; delete after each commit
- [x] 3.8 In `api/avatars.ts`, record the new key before the upload, then read the previous key with a row lock, record
      it, write the new key, and clear the new key in one transaction for the user and the team upload; in
      `api/team/deleteTeam.ts`, delete the team's chat room attachment rows and record their keys and the avatar key in
      the deleting transaction through one `deleteTeamRow`; in `api/users.ts` record the account's chat attachment keys
      and avatar key in one transaction with the user row delete
- [x] 3.9 In `worker/attach.ts` and `api/chat/attachments.ts`, record the key with a one-hour `next_try_at` before the
      upload, clear it in the row insert's transaction, and delete through `deleteStoredObject` on a failed insert
- [x] 3.10 Route `worker/review/score.ts` and `worker/ingest/index.ts` through `deleteStoredObject` with no pending row
      and drop their `.catch(() => {})`
- [x] 3.11 Tests: `worker/store.test.ts` for a failed delete leaving its row and a missing object clearing it,
      `worker/retryPendingObjectDeletions.test.ts` for the backoff and the one report, `api/users.test.ts` for every key
      recorded with the bucket unreachable, and `worker/attach.test.ts` for the pending key after a failed insert and
      none after a success
- [x] 3.12 Update `worker/AGENTS.md` for `retryPendingObjectDeletions.ts` and the store's delete path, `db/AGENTS.md`
      for the table, and add `deleteAttachment` and `deleteResourceContent` to the stale list in
      `.agents/commands/audit-structure.md`

## 4. Show query and cache counts while building

- [x] 4.1 Add cache hit and miss counts and the missed keys to the request store in `db/queryTracing.ts`, with
      `countCacheRead` and `readRequestCounts`, and call `countCacheRead` from `cacheJson` in `db/redis.ts`
- [x] 4.2 In `api/requestTracing.ts`, run the query count for every request outside production, log the line with the
      method, route, status, duration, queries, hits, misses, and in dev the missed keys, and set `Server-Timing`
- [x] 4.3 Tests in `api/requestTracing.test.ts`: the header present outside production and absent with
      `NODE_ENV=production`, and a miss naming its key in the line
- [x] 4.4 Add query budget tests for `GET /api/rooms/mention-count`, `GET /api/topics/:id?poll=1`, the visitor's `GET
      /api/topic-feed`, and `GET /api/topics/:id`, each requesting twice against the pool stub and a fake Redis client,
      with the measured count as the budget, and one case that bypasses the cache and fails
- [x] 4.5 Update `api/AGENTS.md`'s `requestTracing.ts` entry and `db/AGENTS.md`'s `queryTracing.ts` entry

## 5. Catch up chat streams after Redis reconnects

- [x] 5.1 Add `addSubscriberReconnectListener` to `db/redis.ts`, run after a reconnected subscriber has subscribed every
      channel and never on the first connect, and forget the listeners in `setRedisClientBuilder`
- [x] 5.2 In `api/chat/roomStream.ts`, register one listener that emits a catch-up on every open room with zero as
      the notified id, which the stream handler in `api/chat/room.ts` loads past its cursor on as it is
- [x] 5.3 Tests: `db/redis.test.ts` for the hook running once per reconnect and not on the first connect, and
      `api/chat/roomStream.test.ts` for a message stored during the drop reaching an open stream exactly once
- [x] 5.4 Update `db/AGENTS.md`'s `redis.ts` entry for the hook

## 6. Share the topic section cache across replicas

- [x] 6.1 Replace `topicSectionIdCache` in `api/topic/feeds.ts` with `cacheJson` under `topic-section-ids` for 60
      seconds, and make `clearTopicSectionIdCache` delete that key
- [x] 6.2 Call it from `releaseFeatureOrder` as well as `setTopicFeatureOrder`
- [x] 6.3 Test in `api/topic/feeds.test.ts`: two simulated replicas, one fake Redis client, the same order after a
      featuring change
- [x] 6.4 Add the section ids to the README's Redis paragraph

## 7. Purge deleted avatars from the edge

- [x] 7.1 Move the purge into `api/edgeCache.ts` as `purgeEdgeCacheTags` taking any tags, and keep
      `api/edgeCache.purge.ts` calling it with `rendered`
- [x] 7.2 Set `Cache-Tag` on user and team avatar responses in `api/avatars.ts`
- [x] 7.3 Purge the user tag after `deleteUser` commits in `api/users.ts` and the team tag after `deleteTeam` commits in
      `api/team/deleteTeam.ts`, reporting a failed purge, logging a skipped one, and never failing the deletion
- [x] 7.4 Tests: `api/avatars.test.ts` for the tag on each route, `api/users.test.ts` and `api/team/teams.test.ts` for
      one purge per deletion and a failed purge leaving the response unchanged, and `api/edgeCache.purge.test.ts` still
      passing on the release purge
- [x] 7.5 Update `api/AGENTS.md`'s `edgeCache.ts` entry

## 8. Avatar uploads succeed for large photos

- [x] 8.1 Add the HEIC decoder dependency, measuring `heic-to` against `heic2any` under Vite and keeping the lighter
- [x] 8.2 Rewrite `toUploadableAvatar` in `ui/src/components/avatar/AvatarUpload.tsx` as the decode chain: reduced-size
      `createImageBitmap`, the lazy HEIC decoder for a HEIC or HEIF file, then `undecodable`; never return the original
- [x] 8.3 Route the team chooser's `onChange` in `TeamAvatarPicker.tsx` through it, and show "That image couldn't be
      read. Try a JPEG or PNG." in both pickers on `undecodable` with nothing sent
- [x] 8.4 Add `POST /api/avatars/decode-failures` in `api/avatars.ts`, signed-in only, calling `reportError` with the
      content type and byte size, and send it from `toUploadableAvatar` on `undecodable`; add `sendAvatarDecodeFailure`
      to `ui/src/clients/profileClient.ts`
- [x] 8.5 Tests in `ui/src/components/avatar/AvatarUpload.test.ts` with stubbed globals: a large image comes out at 512
      pixels on its longest edge, a HEIC file loads the decoder, and an undecodable file returns `undecodable`;
      `api/avatars.test.ts` for the report route
- [x] 8.6 By hand in the browser against the dev server: upload a photo with EXIF location and confirm the stored object
      holds no EXIF segment, and upload the HEIC sample in Chromium
- [x] 8.7 Update `ui/AGENTS.md`'s avatar entry and `api/AGENTS.md`'s avatars line
- [x] 8.8 Re-encode a PNG, WebP, or GIF source as a PNG so a transparent logo keeps its clear background, and a photo as
      a JPEG, with the test asserting the type each source re-encodes to

## 9. Make search complete and indexed

- [x] 9.1 Rewrite `rankTopicFindings` in `worker/chat/retrieve.ts` as a materialized common table expression through
      `db.execute`, with `toRankedTopicFinding` mapping the rows
- [x] 9.2 Add the three trigram GIN indexes to `db/schema.ts`, generate the migration, and add `create extension if not
      exists pg_trgm;` at its top before applying it
- [x] 9.3 Add `api/topic/search.ts` with `searchTopics` applying the view rules in SQL and `topicSearchRoute` at `GET
      /topics/search`, mounted in `api/api.ts`; add `searchTopics` to `ui/src/clients/topicClient.ts`
- [x] 9.4 In `ui/src/components/search/SearchBar.tsx`, fetch topic matches through the client under the existing
      debounce and minimum, and keep finding matches from the feed
- [x] 9.5 Tests: `worker/chat/retrieve.test.ts` for the generated SQL holding the materialized expression and the topic
      filter inside it, `api/topic/search.test.ts` for the visibility SQL (private never, invite for invitees only,
      small public for its owner only, visitor public and shown only), and `ui/src/clients/topicClient.test.ts` for
      the search request
- [x] 9.6 Add `api/searchPlans.smoke.ts` and `smoke:search-plans`: `explain` on the ranking shows no HNSW scan, and the
      three name searches show their trigram indexes; add the script to the README's Development section and the `smoke`
      chain
- [x] 9.7 Update `api/AGENTS.md` for `topic/search.ts`, `worker/AGENTS.md` for the ranking, and `ui/AGENTS.md` for the
      search bar

## 10. Verify

- [x] 10.1 `bun run check` green
- [x] 10.2 Run `smoke:search-plans`, `smoke:store`, `smoke:attach`, and `smoke:teams` under Doppler
- [x] 10.3 Confirm the startup line on the dev api, the worker, and one sweep names the computed pool size
- [x] 10.4 Confirm the dev request line and the `Server-Timing` header on a cached route requested twice

## 11. Stop a fetch of the unsubscribe link from unsubscribing

- [x] 11.1 In `api/unsubscribe.ts`, add `readUnsubscribeTopic` and `confirmUnsubscribePage`, and give `unsubscribe` the
      entry point and device properties it reports with the event
- [x] 11.2 In `api/api.ts`, make `GET /api/unsubscribe` render the page and `POST /api/unsubscribe` perform the
      unsubscribe, with the RFC 8058 body telling a provider's one-click from the page's button
- [x] 11.3 Tests in `api/unsubscribe.test.ts`: the link writes nothing, the button and the one-click post deactivate the
      subscription, a forged token does nothing on either, and the pages escape the topic and the token

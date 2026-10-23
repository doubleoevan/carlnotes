## 1. Schema and migrations

- [x] 1.1 Add `topics.viewer_count`, `episodes.listener_count`, `findings.viewer_count`, and the `viewer_counters` table
  (bytea counter, cascading topic and podcast episode references, exactly one set under `viewer_counters_ref_shape`,
  update time) in `packages/db/schema/`, and generate the migration
- [x] 1.2 Add a custom migration that backfills `findings.viewer_count` from the distinct users with an `opened_at` in
  `finding_views`
- [x] 1.3 Keep `findings.view_count` and `resources.engagement` in the schema and the database, unread and unwritten,
  with a comment that a later release drops them once no process from before this change runs
- [x] 1.4 Update `packages/db/schema.test.ts` for the new columns and the cascades, and the seed in
  `packages/db/seed.ts`

## 2. Counting in Redis

- [x] 2.1 Add `packages/db/viewerCounts.ts`: the keys, the add script (`PFADD`, then `SADD` to `viewer-counts:changed`
  if it changed), `readViewerEstimate` (`PFCOUNT`), the changed-set take script in `takeChangedViewerCountRefs`,
  `markViewerCountRefsChanged`, the counter read (`getBuffer`), `hasRestoredViewerCounters`, and the merge restore
  (`SET` a temporary key, `PFMERGE`, `DEL`), each through `runWithRedis`
- [x] 2.2 Teach `redisClientStub.ts` and `redisFakeServer.ts` the add and take scripts, `PFCOUNT`, `PFMERGE`, and the
  counter read, with an exact set per key
- [x] 2.3 Add `toViewerElement` in `packages/server`: `u:<userId>` for a user, `v:<hash>` from `toAuthSecretSignature`
  with the purpose `viewer-count` over the address and the user agent, null with no address, and a test for each
- [x] 2.4 Add `isCountedUserAgent` beside `toBot` in `packages/contracts/userAgent.ts`: false for a crawler or a link
  unfurler, true for a podcast app, a feed reader, or a person, with a test

## 3. Recording views and listens

- [x] 3.1 Add `POST /api/topics/:id/view`: skip an uncounted user agent, limit 30 a minute per user, or per address for
  a visitor, through `countRateLimitHit`, count only if `isAllowed(userId, "topic:view", topic)`, and answer 204 in
  every case
- [x] 3.2 Send the view from the topic page after it hydrates and loads its topic, with `keepalive`, once per topic per
  tab through a module-level set, with a test that a repeat in one tab sends once
- [x] 3.3 Count a GET on `/api/episodes/:id/audio.mp3` and on the token feed's audio route after the access check,
  through `countPodcastEpisodeListen`, and nothing on a HEAD, with tests
- [x] 3.4 Count the signed-in user on a playback start in `savePodcastEpisodeListen`

## 4. The sweep's sync and restore

- [x] 4.1 Add `syncViewerCounts` in `apps/worker` under the claim `viewer-count-sync`: restore every saved counter if
  `viewer-counts:restored` is missing, then take the changed set, read each estimate and counter, and write the columns
  with `greatest` and the counters in one transaction, putting the refs back if the write fails
- [x] 4.2 Call it from `runSweep` in `apps/worker/schedule.ts`, and update `apps/worker/AGENTS.md`
- [x] 4.3 Test a restart: an empty Redis plus a saved counter merges to the union, and a column never lowers
- [x] 4.4 Seed the rebuild from Postgres: `loadViewerCountSeeds` in `apps/worker/viewerCountSeeds.ts` reads each topic's
  owner, active followers, and finding openers, and each podcast episode's listeners, and `restoreViewerCounters` adds
  them before setting the marker. Add the owner to a new topic's counter in `createTopic`. Test that a seeded person
  counts once, a rerun changes nothing, and the first sync counts an owner, and run the rebuild on the dev database

## 5. The counts endpoint

- [x] 5.1 Add the contracts in `packages/contracts/viewerCounts.ts`
- [x] 5.2 Add `GET /api/counts/topics/:id` and `GET /api/counts/episodes/:id`: one row read, the larger of the estimate
  and the column, and 404 for a caller `isAllowed` denies `topic:view`
- [x] 5.3 Send a public topic's counts with `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=30`, and every
  other response with `Cache-Control: private, no-cache`, through a helper in `apps/api/edgeCache.ts`, with tests for
  both
- [x] 5.4 Add the fetches in `packages/client`, without credentials for a public topic

## 6. The page lines and `FlashingCount`

- [x] 6.1 Add `apps/web/src/components/common/FlashingCount.tsx`, which takes `label` and `count` and renders
  "Label: <number>", with its stories Default, Thousands, Changing, and ReducedMotion, and the `count-flash` keyframe
  in `animations.css`, stopped by the reduced-motion block and a `[data-motion="reduced"]` ancestor
- [x] 6.2 Add `FlashingCount` to the Badge and count row of `apps/web/src/nightshift/inventoryTable.md`
- [x] 6.3 Fold `startScanPoll` into `startVisiblePoll({ reload, toPollMs, isReloadingAtStart })` in
  `apps/web/src/lib/visiblePoll.ts`, which polls only while the page is visible and never sends a second read while
  one is in flight, and call it from the scan poll and from a counts poll hook that reads at start on a visible page,
  then every 60 seconds while visible, with a test
- [x] 6.4 End the topic page with "Viewers: N" and "Followers: N" and the podcast episode page with "Listeners: N", each
  label muted and each number highlighted, each line holding one line of height and empty until mounted
- [x] 6.5 Test that a visitor's server-rendered topic page holds no viewer or follower count in the new line

## 7. Trending

- [x] 7.1 Add `viewerCount` and `feedUpdatedAt` to `TopicFeed` and the feed read, taking the newest shown finding's
  time from a window in the findings query, and make the sitemap's subquery in `apps/api/seo.ts` count shown findings
  too
- [x] 7.2 Sort Yours, Subscribed, and Popular under Trending by viewers, followers, `feedUpdatedAt`, then id, and keep
  Featured's order, in `packages/core/lib`, wired in `TopicFeedProvider.tsx`
- [x] 7.3 Sort findings under Trending by `viewerCount`, recency, then id in `topicFindingSorts.ts`, keeping the
  bookmark pin
- [x] 7.4 Test the topic order with ties on viewers and on followers falling to recency, Featured unchanged, the finding
  order, and the bookmarked pin
- [x] 7.5 Rename `TopicFinding.viewCount` to `viewerCount`, read `findings.viewer_count` in both reads, and label the
  stats line "Viewers"
- [x] 7.6 Make `recordView` lock the finding row `for no key update`, add one only on a person's first open, and still
  insert every open, with a test

## 8. Engagement removed

- [x] 8.1 Remove `engagement` from `TopicFinding`, `apps/api/topic/feedData.ts`, `apps/api/topic/findings.ts`, the sort,
  and every fixture and story
- [x] 8.2 Stop the Reddit, X, and Bluesky ingesters capturing it, stop the upsert refreshing it, and update their tests
  and smokes

## 9. Copy and docs

- [x] 9.1 Add the counts paragraph after the privacy page's Product analytics section and move its date
- [x] 9.2 Update `apps/docs/src/content/docs/feed/reading-your-feed.md` for the Trending order and the counts, add the
  listener count to `apps/docs/src/content/docs/feed/coffee-break.md`, and fix the Trending sentence in
  `apps/docs/src/content/docs/topics/writing-a-prompt.md`, which credits ratings
- [x] 9.3 Update the root `AGENTS.md`, `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/worker/AGENTS.md`,
  `packages/client/AGENTS.md`, `packages/contracts/AGENTS.md`, `packages/core/AGENTS.md`, `packages/db/AGENTS.md`,
  `packages/server/AGENTS.md`, and the drift list in `.agents/commands/audit-structure.md` for `view_count` and
  `engagement`

## 10. Verification

- [x] 10.1 `bun run check` passes
- [x] 10.2 The `FlashingCount` story builds in Storybook with its accessibility checks passing
- [x] 10.3 Run the after load test on the topic page, `/api/topics/:id`, `/api/topic-feed`, the counts endpoint, and
  the view request, record it in `design.md`, and ship the counts static, read once per page load, if the counts add
  measurable load at the origin
- [x] 10.4 Add the cache rule line in Cloudflare (done on 2026-10-22). The check that a signed-out counts request
  is a `HIT` on its second request runs after the deploy, as the Migration Plan says

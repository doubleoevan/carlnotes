## Context

Trending sorts a topic's findings by `resources.engagement` on the client, in `toSortedTopicFindings`
(`packages/core/lib/topicFindingSorts.ts`). The value is a Reddit score, an X like count, or a Bluesky like count, on
three scales, and null for every other Source. No sort mode reorders topics on Home: Yours and Subscribed list newest
created first, Featured follows `topics.feature_order`, and Popular is the top 50 public topics by
`subscriber_count`. `findings.view_count` adds one for every open by a signed-in person, and `finding_views` keeps one
row per open, so neither is a count of people.

Nothing counts a topic's viewers or a podcast episode's listeners. Signed-out web plays leave no server record, and a
podcast app's download from a public feed leaves none either. The audio route `/api/episodes/:id/audio.mp3` answers a
GET with a 302 to a presigned object storage url, marked `private, no-store`, so the edge never caches it and the
origin sees every play and every download. The token feed's audio route is marked `private, no-store` too.

Redis is one Northflank node with no backups, and every use of it already treats a restart as coming back empty. The
scheduled sweep runs from a Northflank cron every 15 minutes in production (`*/15 * * * *`) and every minute in dev, and
claims its work through `runWithClaim`.

Visit analytics already count visitors through PostHog's own daily-salted hash, which the app never sees. The
monitoring spec forbids storing a visitor identifier, and the privacy page promises that analytics set no cookie and
store nothing on the device.

## Goals / Non-Goals

**Goals:**
- Count a topic's viewers and a podcast episode's listeners as unique people, all time, without touching the page's
  read path.
- Show the counts after hydration, fresh within about 90 seconds, without a stream.
- Rank Trending by counts a person can explain.
- Keep every count the last sweep saved through a Redis restart, and never show a count that dropped.

**Non-Goals:**
- Counts in the server-rendered HTML, the sitemap, the llms files, share previews, or emails.
- A stream, or any time window: the counts are all time.
- Counting a visitor's finding opens. The finding view route needs sign-in today, and stays that way.
- Changing the Relevance and Newest orders, or the Popular section's selection.
- Keeping the views and listens a Redis restart loses before the next sweep (decision 6).

## Decisions

### 1. One HyperLogLog per topic and per podcast episode

A topic's viewers live in `viewers:topic:<topicId>` and a podcast episode's listeners in
`listeners:podcastEpisode:<podcastEpisodeId>`. A HyperLogLog keeps 12 KB at most per key, whatever the count, with a
standard error of 0.81%, and stores no element, so no list of people exists anywhere. The element is `u:<userId>` for a
signed-in person and `v:<hash>` for a visitor (decision 2).

A `ViewerCountRef` names the topic or the podcast episode a count belongs to. One Lua script in
`packages/db/viewerCounts.ts`, sent through the Redis store's `send("EVAL", …)` like the rate limit scripts, adds the
element and, if the add changed the counter, adds the ref to the set `viewer-counts:changed`:

```lua
if redis.call('PFADD', KEYS[1], ARGV[1]) == 1 then redis.call('SADD', KEYS[2], ARGV[2]) end return 1
```

The call goes through `runWithRedis`, so a Redis failure is a null and a lost count, never a failed request. Both
Redis test fakes gain a branch for the script and for `PFCOUNT`, keeping an exact set per key, since today both answer
any unknown command with a silent 0.

Alternative: a row per viewer in Postgres. It grows with every visitor, puts a write on every page load's path to
Postgres, and is the per-person record the counts are meant to avoid.

### 2. A visitor is a keyed hash of the address and the user agent, never stored

A visitor's element is `toAuthSecretSignature({ value: "<address>\n<user agent>", purpose: "viewer-count", encoding:
"base64url" })` from `packages/server/hmac.ts`, which keys an HMAC with `BETTER_AUTH_SECRET` and a purpose, as the
signup gate and the unsubscribe links already do. No new Doppler secret is needed. The address is the one
`resolveClientAddress` resolves through the trusted proxies, and a request with no resolvable address counts nothing,
since it cannot be told apart from anyone else.

The hash goes into the counter and nowhere else. A HyperLogLog keeps only the longest run of zero bits seen in each of
its registers, so neither the address nor the hash can be read back out of it. Nothing is set on the device: no
cookie, and nothing in `localStorage` or `sessionStorage`. This is a separate mechanism from the visit analytics,
stores no identifier, and leaves that requirement as it stands.

The key is fixed, not a daily salt. A daily salt would count a visitor who returns the next day as a new person,
inflating an all-time count by every return. A fixed key counts them once, and rotating `BETTER_AUTH_SECRET` re-keys
it, so a visitor seen before a rotation counts again after it. People behind one address with one browser count as
one, and one person on two browsers counts as two, which is the approximation the counts accept.

The privacy page gains a paragraph after Product analytics, since the counts are not PostHog and run on every instance,
and its date moves: "To show how many people view a topic or listen to a podcast episode, we add your account id, or a
one-way keyed hash of your IP address and browser if you are signed out, to an approximate counter. The counter keeps no
record of who you are, cannot be turned back into your address, and sets nothing on your device."

### 3. A topic view is one request after the page loads

The topic page sends `POST /api/topics/:id/view` once the page has hydrated and loaded its topic, with `keepalive` and
the browser's credentials, so a signed-in person counts by user id. A module-level set in the browser remembers the
topics this tab has counted, so a repeat visit in one tab sends nothing until the tab reloads. Holding the set in memory
alone keeps the promise that nothing is stored on the device, and a repeat after a reload adds an element the counter
already holds.

The route answers 204 whatever happens, so it never reveals whether a topic exists. It skips a request whose user agent
`toBot` names as a crawler or a link unfurler, and counts a request under `countRateLimitHit` at 30 a minute per user
for a signed-in person, or per address for a visitor (`rate-limit:topic-view`). It counts only if the caller may view
the topic, through one topic select and `isAllowed(userId, "topic:view", topic)`. A POST is never cached at the edge,
so every view reaches the origin.

The rate limit is the ceiling on abuse: one address that varies its user agent adds at most 30 elements a minute.

### 4. A listen counts at the audio route and at the web player's playback start

Both audio routes count a GET through `countPodcastEpisodeListen`, after the podcast episode passes its access check:
`/api/episodes/:id/audio.mp3` counts the signed-in user or the visitor's hash, and
`/api/podcast-feeds/:token/episodes/:id/audio.mp3` counts the token's user. A HEAD counts nothing, since an app sends
one to read the size before it downloads. Crawlers and link unfurlers are skipped, and podcast apps and feed readers,
which `toBot` also names, are counted.

The web player loads the audio with `preload="none"`, so its first play fetches the audio route and counts there. Beside
it, `savePodcastEpisodeListen` calls `countPodcastEpisodeListen` with the signed-in user on a playback start, so a
listen counts even if the browser plays from an audio url it already holds. The two adds use the same element, so
nothing counts twice.

What is missed: an app that downloads once on its server for many listeners counts as one, and an app that downloads a
podcast episode its listener never plays counts as a listener, since a download is the only signal a podcast app
gives.

### 5. The sweep copies the estimates into columns

A new claimed task, `syncViewerCounts` under the claim `viewer-count-sync`, runs in every sweep, so every 15 minutes in
production and every minute in dev. `takeChangedViewerCountRefs` takes the changed set in one script (`SMEMBERS`, then
`DEL`), and for each ref the sync reads `PFCOUNT` and the counter's bytes through Bun's `getBuffer`.

The sync then writes the refs in id order, one transaction per 100 refs. For each ref it raises `topics.viewer_count` or
`episodes.listener_count` to `greatest(column, estimate)` and returns the row. It saves the counter in `viewer_counters`
only if a row came back, since a deleted topic or podcast episode has none. If a read or the write fails,
`markViewerCountRefsChanged` puts the refs back into the changed set for the next sweep.

The home feed and the Trending sort read only the columns, so they gain no Redis call. Trending's order lags the live
counts by up to one sweep, 15 minutes in production, which is enough for an order that changes slowly.

### 6. A saved count survives a Redis restart

`viewer_counters` holds one row per topic or podcast episode: the counter's bytes, a cascading reference to its topic or
its podcast episode, and the check `viewer_counters_ref_shape`, which requires exactly one of the two. Before taking
the changed set, the sync calls `hasRestoredViewerCounters`, which reads the key `viewer-counts:restored`. If the key
is missing, Redis has restarted, so the sync merges every saved counter back into its key (`SET` a temporary key with
the bytes, `PFMERGE` it into the live key, `DEL` the temporary key), then sets the marker.

A merge is a union, so views added between the restart and the restore are kept along with the saved ones. Restoring
before copying means a counter that restarted empty never overwrites a saved one, and `greatest` keeps a column from
ever going down. The counts endpoint returns the larger of `PFCOUNT` and the column, so a page never shows a count that
dropped.

The restore brings back what a sweep saved and the signed-in people §6a seeds. Any other element added after the last
sweep and before the restart was never saved, so the restart loses it. That is up to one sweep's worth of new viewers
and listeners, 15 minutes in production. The shown count never drops below the saved value, and a lost person counts
again on a later view or listen.

### 6a. The rebuild seeds the signed-in people Postgres records, and a topic counts its owner

The same rebuild also adds every signed-in person Postgres already records, as the `u:<userId>` element the live count
adds: each topic's owner, its active followers, and the users who opened its findings (`finding_views` with an
`opened_at`), and each podcast episode's listeners (`podcast_episode_listens`). `loadViewerCountSeeds` in
`apps/worker/viewerCountSeeds.ts` reads them, and `restoreViewerCounters` adds them with `PFADD` in batches of 500,
lists every seeded topic and podcast episode as changed, and only then sets the marker. Adding a person who is already
counted changes nothing, so a rerun after a Redis restart is safe.

Production Redis has no marker before the release, so the first sweep after the deploy runs the rebuild and seeds the
counts, with no script and no timing window. Signed-out visitors from before the release cannot be seeded, since
nothing about them was ever stored.

A topic counts its owner, so no topic page shows zero viewers. The seed covers every topic that exists, and
`createTopic` in `apps/api/topic/saveTopic.ts` adds the owner to a new topic's counter when it creates the topic.

- *Alternative: seed from PostHog.* Rejected. Page views record route shapes and no topic id, `visit_topic_viewed`
  started on 2026-10-09 and names public topics only, cookieless analytics count a returning visitor once per day, and
  podcast apps are recorded by name, not by listener. Reading PostHog would also need a new personal API key.
- *Alternative: write seeded numbers into the columns.* Rejected. The shown count is the larger of the estimate and the
  column, so a seeded column would hide new viewers until the estimate passed it.

### 7. One counts endpoint, shared at the edge for a public topic

`GET /api/counts/topics/:id` returns `{ viewerCount, subscriberCount }`, and `GET /api/counts/episodes/:id` returns
`{ listenerCount }`. Each reads one row for its access check and its column, and one `PFCOUNT`. The contracts live in
`packages/contracts/viewerCounts.ts`, and the fetches in `packages/client`.

A public topic's counts, and the counts of a public topic's podcast episode, are the same for everyone. The client
fetches them without credentials, so no session cookie reaches Cloudflare, and the route answers with
`Cache-Control: no-cache` and `CDN-Cache-Control: max-age=30`. It sends no `stale-while-revalidate`, so a count at the
edge is at most 30 seconds old, and no `Cache-Tag`, since a release has nothing to purge. A count 30 seconds old, read
by a page that polls every 60 seconds, shows a new viewer within 90 seconds.

A private, team, or invite topic's counts are fetched with credentials and checked like the topic, through `isAllowed`
with `topic:view`. The invite activation gate filters which findings a subscriber reads, not the topic, so the counts
skip it. A read the caller may not make answers 404. An allowed read of such a topic, any request with credentials, and
every error are sent `private, no-cache`.

The first cache rule gains one line, a manual Cloudflare change:

```
or starts_with(http.request.uri.path, "/api/counts/")
```

The second rule still bypasses any request with a session cookie, and only the public responses include a
`CDN-Cache-Control` the edge can store.

### 8. The pages read the counts after hydration and poll while visible

The topic page ends with a line after its cards that reads "Viewers: 4" and "Followers: 27", with space between the two
counts. The podcast episode page ends with "Listeners: 1" after its last section. Each label is fixed and muted, so a
count of one reads "Viewers: 1", and each number is bold in the text color. Each line holds one line of height in the
server render and stays empty until the page has mounted, so no count reaches the server-rendered HTML and nothing
shifts when the line fills in. The topic page's own payload includes no viewer count. The Home feed's payload does, as
the Trending sort key (decision 10), and Home renders no count.

The page fetches the counts once after hydration, then every 60 seconds while the tab is visible.
`startVisiblePoll({ reload, toPollMs, isReloadingAtStart })` in `apps/web/src/lib/visiblePoll.ts` polls only while the
page is visible, reloads when the tab shows again, and never sends a second read while one is in flight. The scan poll
in `useTopicScan.ts` and the counts poll in `usePolledCounts.ts` both call it. The counts poll passes a fixed 60
seconds and `isReloadingAtStart`, so it reads at once if the page is visible when the poll starts.

The follower label in the Topic roast card and the info popover stays server-rendered. It is part of the topic's
description, cached with the page for a minute like the rest of it, while the new line is the live count.

Alternative: ride the badge poll in `AppChatPanel`. It runs only for signed-in users, every 45 seconds, and does not
pause in a hidden tab.

### 9. `FlashingCount` is a shared component

`apps/web/src/components/common/FlashingCount.tsx` takes a `label` and a `count` and renders "Label: <number>". The
label takes the line's muted color, and the number is bold in the text color with `tabular-nums`, so the width holds as
digits change. When the count changes after its first value, the number replays a one-time keyframe, `count-flash`,
from a `primary` background at 45% to transparent over 1.2 seconds. `primary` is the highlight color, so no new token
is needed. The first value never flashes. The flash stops under `prefers-reduced-motion` through the existing
reduced-motion block in `animations.css`, and under a `[data-motion="reduced"]` ancestor so a story can show it.

The topic line renders two `FlashingCount`s with space between them. The stories are Default, Thousands (12,345 with
its separator), Changing, and ReducedMotion, and the component joins the Badge and count row of the Nightshift
inventory.

### 10. Trending orders topics by viewers, then followers, then recency

Under Trending, Yours, Subscribed, and Popular order their topics by `viewerCount`, then `subscriberCount`, then
`feedUpdatedAt`, all descending, then by id, on the client as findings are sorted today. `TopicFeed` gains
`viewerCount` and `feedUpdatedAt`, the newest shown finding's creation time or the topic's own. The feed read takes it
from a window over the shown findings its query already ranks, so it adds no query. The sitemap's subquery in
`apps/api/seo.ts` counted a finding rated down, which no page shows, so it now counts shown findings too, and both reads
give a topic the same time.

Featured keeps its hand-set order under every sort. An admin's order is what the section means, and re-sorting it would
undo that choice. Popular is still the 50 public topics with the most followers. Production has 25 public topics outside
Featured on 2026-10-22, so today the limit drops none of them.

Relevance and Newest keep today's topic order.

### 11. Trending orders findings by unique viewers, then recency

Bookmarked findings stay pinned on top. Each group orders by `viewerCount`, then recency, both descending, then by
finding id, so the order is total and the same on Home and on the topic page. Home still sorts the 25 most relevant
findings of each topic, as it does today.

`findings.viewer_count` replaces `findings.view_count`, and counts the signed-in people who opened the finding. It is
backfilled from `finding_views` as the distinct users with an `opened_at`. `recordView` locks the finding row
`for no key update`, checks for the user's earlier open, inserts the open, and adds one only for a first open. Taking
the row lock before the insert keeps it clear of the deadlock that a lock after a foreign key insert caused in the
subscriber recount. `finding_views` keeps one row per open. The stats line in the note popover reads "Viewers", and
`TopicFinding.viewCount` becomes `viewerCount`. `findings.view_count` stays, unread and unwritten (decision 13).

### 12. Engagement is removed

`engagement` leaves the `TopicFinding` contract, both feed reads, and the sort. Nothing else reads it, its three
scales cannot be compared, and keeping a column filled by three ingesters for no reader is dead weight. The Reddit, X,
and Bluesky ingesters stop capturing it, and the upsert stops refreshing it. `resources.engagement` stays in the
database, unread and unwritten, until a later release drops it (decision 13). A future ranking that wants an outside
signal can capture one again.

### 13. Migrations

`0115_viewer_counts.sql` adds `topics.viewer_count`, `episodes.listener_count`, and `findings.viewer_count` as
`integer not null default 0`, and the `viewer_counters` table. The custom migration
`0116_backfill_finding_viewer_counts.sql` backfills `findings.viewer_count`.

This change drops no column. The release pipeline in `infra/northflank/release-main.json` builds the image, runs the
migrate job, deploys the app, then deploys the worker. The migrations run while the old app and the old worker still
run, and both read `findings.view_count` and `resources.engagement`, so a drop in this release would fail those reads.
Both columns stay in the schema, as `viewCount` and `engagement`, and in the database, unread and unwritten. A later
release drops them once no process from before this change runs.

## Risks / Trade-offs

- [Counts are estimates] → a standard error of 0.81%, and closer than that for a small count. The counts are
  approximate by design.
- [A visitor who changes network or browser counts again] → accepted. Telling them apart would take an identifier on
  the device.
- [One address forging user agents] → adds at most 30 elements a minute, the rate limit.
- [A podcast app's server-side downloads] → count as one listener per fetching server.
- [Redis restarts between sweeps] → the views and listens added since the last sweep are lost, up to 15 minutes of new
  viewers and listeners in production. The restore merges the saved counters back, and the endpoint shows the larger of
  the live count and the column, so a shown count never drops.
- [A deleted topic's or podcast episode's counter stays in Redis] → its saved counter row cascades away with it, and the
  sync saves no counter for a deleted row, so a restart does not bring it back. Until then it takes a few hundred bytes
  for a small audience and at most 12 KB, the size of a full HyperLogLog.
- [Two unused columns for one release] → `findings.view_count` and `resources.engagement` keep their space until a
  later release drops them.
- [Live counts add load at the origin] → the after run showed no measurable load at the origin, and the edge caches a
  public topic's counts for 30 seconds.

## Load test

`oha -c 50 -z 30s` against the local dev api, as the README's load test runs it, on 2026-10-22 with the machine's load
average near 15.

Before:

| Route | Requests per second | p50 | p90 | p99 | Slowest |
|---|---|---|---|---|---|
| Topic page `/topics/top_mcp_watch/mcp-ecosystem-watch` | 6061 (1143 rendered, 180,696 shed with 503) | 2 ms | 16 ms | 73 ms | 1.16 s |
| Topic data `/api/topics/top_mcp_watch` | 1789, every one a 200 | 26 ms | 33 ms | 50 ms | 0.91 s |
| Feed `/api/topic-feed` | 306, every one a 200 | 153 ms | 175 ms | 527 ms | 1.62 s |

The page run measures the render limit, not render speed: the page render limit sheds what the render slots cannot
take, as the restructure's runs found.

After, on the built change, with the machine's load average between 6 and 10:

| Route | Requests per second | p50 | p90 | p99 | Slowest |
|---|---|---|---|---|---|
| Topic page `/topics/top_mcp_watch/mcp-ecosystem-watch` | 7262 (1120 rendered, 216,728 shed with 503) | 2 ms | 8 ms | 66 ms | 1.48 s |
| Topic data `/api/topics/top_mcp_watch` | 1619, every one a 200 | 27 ms | 36 ms | 60 ms | 3.75 s |
| Feed `/api/topic-feed` | 296, every one a 200 | 155 ms | 193 ms | 420 ms | 1.65 s |
| Counts `/api/counts/topics/top_mcp_watch` | 1171, every one a 200 | 41 ms | 47 ms | 58 ms | 0.60 s |
| View `POST /api/topics/top_mcp_watch/view` | 12,000, every one a 204 | 4 ms | 6 ms | 11 ms | 0.04 s |

The three routes the change did not add are within the runs' noise: the page renders 1120 against 1143, the topic data
serves 1619 against 1789, and the feed 296 against 306. The feed gains no query, since its newest finding time comes
from the window its findings query already runs. The counts read costs one row and one `PFCOUNT`, about a tenth of the
feed read. A page reads it once a minute, so 1000 open pages send about 17 reads a second, and the edge answers a public
topic's for 30 seconds. The view costs one rate limit count and one `PFADD`. The live counts add no measurable load at
the origin, so they ship live.

## Migration Plan

The migrations run in the release's migrate job. They add columns and a table, and backfill `findings.viewer_count`. The
cache rule line was added in Cloudflare on 2026-10-22, ahead of the deploy, since nothing requests `/api/counts/` until
the new code ships. The first sweep after the deploy rebuilds Redis and seeds the counts. After the deploy, check that a
signed-out `GET /api/counts/topics/<id>` returns `cf-cache-status: HIT` on its second request. A later release drops
`findings.view_count` and `resources.engagement`.

Rollback is reverting the commit. Both old columns still exist, so the reverted app and worker read and write them
again, missing only the opens and the engagement scores from while this change ran. The new columns and table stay and
are harmless.

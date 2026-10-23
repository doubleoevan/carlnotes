## Why

A visitor cannot see how many people read a topic or listen to a podcast episode, and Trending ranks findings by
`resources.engagement`, a Reddit score, an X like count, or a Bluesky like count on three unrelated scales that nobody
can explain. Trending should mean most viewed first, and the counts that rank it should be the ones a visitor sees, all
without costing page speed.

## What Changes

- **Counting.** A topic's viewers and a podcast episode's listeners are counted as unique people, all time, in a Redis
  HyperLogLog per topic and per podcast episode. A signed-in person counts by user id. A visitor counts by a keyed hash
  of the address and the user agent that is never stored, keyed by `BETTER_AUTH_SECRET`, so no new secret is needed. A
  topic view is one small request after the page loads, once per topic per tab, rate limited per user, or per address
  for a visitor, and skipping crawlers and link unfurlers. A listen counts at the audio route that every web play and
  every podcast app download passes through, the public feed's anonymous downloads included, and at the web player's
  playback start.
- **Durability.** The scheduled sweep, every 15 minutes in production, copies each changed estimate into a column and
  saves the counter's bytes in Postgres. After a Redis restart it merges the saved counters back into Redis, and the
  counts endpoint shows the larger of the live estimate and the column, so a shown count never drops. A restart still
  loses the views and listens added since the last sweep, up to one sweep's worth of new viewers and listeners.
- **Live counts.** One JSON endpoint per topic and per podcast episode returns its counts. The topic page ends with
  "Viewers: 4" and "Followers: 27" side by side, and the podcast episode page with "Listeners: 1": a muted label, a
  colon, and the number in bold in the text color. Both lines fill in after hydration only, read once and then every 60
  seconds while the tab is visible. A public topic's counts are fetched without credentials and shared at the edge for
  30 seconds. A number that changes flashes once, and not at all with reduced motion.
- **Nightshift.** `FlashingCount` joins `apps/web/src/components/common` with its stories and the inventory.
- **Trending.** Under Trending, Home's Yours, Subscribed, and Popular sections order their topics by viewers, then
  followers, then their newest finding's time, and Featured keeps its hand-set order. Findings order by unique viewers,
  then recency, with bookmarked findings still pinned on top.
- **Finding viewers.** `findings.viewer_count`, the signed-in people who opened the finding, replaces
  `findings.view_count`, which counts every open, and is backfilled from `finding_views`. The stats line reads Viewers.
- **BREAKING:** `engagement` leaves the `TopicFinding` contract, both feed reads, and the sort. The Reddit, X, and
  Bluesky ingesters stop capturing it, and nothing writes `resources.engagement` again.
- **Old columns kept for one release.** `findings.view_count` and `resources.engagement` stay in the schema and the
  database, unread and unwritten. The release runs its migrations while the old app and worker still run, and those
  read both columns. A later release drops them once no process from before this change runs.
- **Privacy page.** One paragraph says how the counts are kept.
- **Cloudflare.** One line joins the first cache rule, a manual dashboard change.

## Capabilities

### New Capabilities

- `viewer-counts`: counting viewers and listeners, the keyed visitor hash, the sweep's copy and restore, the counts
  endpoint, the page lines and their polling, and the flashing count.

### Modified Capabilities

- `feed-homepage`: Trending orders topics by viewers, followers, and recency, and findings by unique viewers.
- `feed-api`: topic findings include `viewerCount` and no `engagement`, and a topic feed includes its viewer count and
  newest finding's time.
- `edge-caching`: the counts route joins the paths the edge may cache, shared for 30 seconds if public.
- `source-ingestion`: the Reddit, X, and Bluesky ingesters capture no engagement, and a rescan refreshes nothing.
- `domain-schema`: the viewer, listener, and counter columns are added, and `resources.engagement` and
  `findings.view_count` are no longer read or written.
- `seo`: a topic's sitemap and structured data date it by its newest shown finding, the time the trending sort reads.

## Impact

- `apps/api`: the view route, the counts routes, the audio routes' count, the listen hook, the feed and topic reads,
  `findingFeedback.ts`, and the sitemap's topic time in `seo.ts`.
- `apps/worker`: a claimed viewer count sync in the sweep.
- `apps/web`: the topic and podcast episode page lines, `FlashingCount` and its stories, `startVisiblePoll`, the
  Trending sort, the stats label, the privacy page.
- `packages/db`: the schema, migrations, the Redis store's HyperLogLog script and fakes. `packages/contracts`,
  `packages/client`, `packages/core` (the sort), and the three ingesters in `packages/pipeline`.
- Cloudflare: one line in the first cache rule. Docs: the feed sorts page, the listener count on the podcast page
  (`feed/coffee-break.md`), and the Trending sentence in the prompt writing page, which wrongly credits ratings.

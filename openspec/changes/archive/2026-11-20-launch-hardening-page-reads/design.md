# Design

This is Part B of the launch hardening work, the api's page reads. The split into four changes, the places where a
person's experience would change, every finding from the closing read, and every stale claim are listed once, in
`launch-hardening`'s design under "Read this first". This change ships after `launch-hardening`, because its pages
render on the web service that change adds, and before `launch-hardening-browser-load`.

## Context

See proposal.md for why. What shapes the approach:

- A visitor's page is rendered on the server, and that render reads the api with no session and no forwarded
  address. A server render never passes the edge, so only an origin cache protects it. A signed-in page is never
  server rendered and never cached.
- A cold visitor profile is 3 requests and 41 queries, a team page 31, a topic page 34, a podcast episode page 27,
  and one read can start 20 statements at once against a default pool of 15 (A.13).
- `contracts/0.1.0.json` is enforced though no release is recorded. It names every data route of these pages and no
  head route. A shipped build and a stored MCP view read whole lists and page them on the device.
- Cloudflare caches only the `/api/` paths its one rule names, and the rule lives in no file. A new edge header does
  nothing until the rule names its path (finding O7).

## Goals / Non-Goals

**Goals:**

- One request per page from the server render, and nothing fetched again by hydration.
- A visitor's page costs no query on a warm key, and a write by the page's owner shows at once.
- Each page's query count and request count are held by a test whose fixture has a row in every branch.
- A poll costs a key read, and the person waiting sees their result as fast as today.
- No read grows with the table it reads.

**Non-Goals:**

- Removing or changing a route a released snapshot names, or a field an MCP tool returns.
- Caching a view POST, an audio or film hop, or any response a session or a bearer token shaped.
- A slower poll for a person who is waiting.

## Decisions

### D1. A server render is told apart from a visitor as it is today, and the client address is read more strictly (close)

- **Chose:** `isUncountedRequest` keeps its rule: a request with no session and no forwarded address that resolves
  to an external one is a render's own read. It holds from the web service's private address by construction,
  because a render's fetch sends no forwarded header. Tests name the private-network shape, the quiet limiters, and
  the search limiter, and one pins that the server's client sets no forwarding header. The client address itself is
  resolved from `cf-connecting-ip` if the hop that reported the client is a trusted Cloudflare address (finding S2),
  so a request relayed through a Cloudflare Worker is counted under the Workers address and never resolves to
  nothing.
- **Why:** live probes showed a forged `X-Forwarded-For` is counted under the sender's own key, directly and through
  Cloudflare. The one open case is a sender inside Cloudflare's own ranges.
- **Rejected:** a secret mark the web service signs. A missing or mismatched secret would limit every render, and
  requiring the mark would turn a wrong `TRUSTED_PROXIES` into a 429 for the whole site, where today's rule fails
  open on purpose. Also rejected: the peer's address range (recorded nowhere, and a mesh sidecar hides it), and
  forwarding the visitor's address (every render's read would then be counted).
- **What would tip it:** the task probes a real Worker, read-only. If a relayed request can still resolve to nothing
  with the stricter address, the signed mark is the next step.

### D2. One page read per page is a new `/page` route beside each data route

- **Chose:** `GET /api/profiles/:userId/page`, `/api/topics/:id/page`,
  `/api/topics/:id/episodes/:season/:episodeNumber/page`, `/api/topic-posts/:id/page`, and
  `/api/dashboards/:dashboardKind/:subjectId/page`, each returning the head with the page. `/api/teams/:id/page`
  already has the name and gains the head and the saved Visitors count. `/api/home` stays the home's one read, and a
  signed-in home's request may ask for its first news page. The routes a shipped build reads stay as they are, on
  the same grouped loaders, so the site, shipped builds, and MCP tools all get the cheaper reads. The six head
  routes go once the web stops reading them: no snapshot names one.
- **What each holds:** the head and everything the first screen shows. What stays a read of its own: a comment
  thread past its first page, a later page of a list, a chart selection other than the default, a team's notes, the
  recap (it can hold five seconds on a model call), the counts poll, the layout's reads, and the view POST.
- **Why:** it is what the request describes and what the team page already does. A head folded into the data route
  would add 12 KB to every poll and every mobile read of the topic page.
- **Rejected:** optional fields on the existing routes behind a flag (one path with two shapes to cache, tag, and
  freeze).
- **A part folded into a page read returns null on its own failure**, so a failed news read never turns a profile
  into a 503.

### D3. The visitor's payload is cached at the origin and cleared by topic

- **Chose:** each page read's visitor branch goes through `cacheJson`: 60 seconds for the profile, the team page,
  the home, and a Specials page, and 30 seconds for the topic, the podcast episode, and the Topic Post, the
  lifetimes their neighbors already use. The keys and their clears live in one `packages/db` module, because the
  pipeline clears them and cannot import an app. One `clearVisitorPagesOfTopic` clears a topic's page, its podcast
  episode pages, its Topic Post pages, its owner's profile, and its teams' pages. It is called behind the two
  existing topic clear helpers and at the pipeline's writes: a podcast episode's publish, a film's ready swap and a
  re-render's swap, an image render, a discussion's publish or failure, a Topic Post's edit, a body image taken down
  by an admin, and a summary. A profile's and a team's own writes clear their own key. Follows, reactions, Scan
  counts, and the Visitors line ride the lifetime.
- **Why:** the head is inside the cached read, so a warm topic render goes from 8 queries to none. The pipeline's
  clears sit in activity bodies, so none needs `patched`.
- **Rejected:** a 30-second lifetime everywhere (twice the loads while the edge copy is a minute old anyway), a
  Redis hash per topic (new commands in the store and its stub), and a generation counter in the key (a Redis read
  on every hit).

### D4. A signed-in reader gets the shared payload and a small part of their own (close for the topic page)

- **Chose:** the page's owner, an editor, an admin, and any reader of a subject that is not public get the full
  uncached read behind one session read, one access check, and one request memo. Every other signed-in reader gets
  the cached visitor payload and an uncached part of the user's own: their reactions, bookmarks, ratings, listens,
  block, and permissions.
- **Why:** it is what the request asks, and it keeps the cache whole: the visitor payload is the same for everyone.
- **What would tip it:** the topic page has about thirty fields of the user's own, and its comment thread hides
  authors in a user block with the reader, so the shared thread has to be filtered and not only added to. The
  profile, the team page, the Topic Post, and the Specials page ship first. If the user's own part of the topic page
  proves too wide at apply, a signed-in reader of a topic page keeps the full uncached read, and the task says so.

- **Applied (3.11, 3.12):** a signed-in reader of a profile, a team page, a Topic Post, and a Specials page who is not
  the subject's owner, an editor, or an admin, and who reads a public subject, gets the visitor copy and the user's
  own part, `userState`, and the apps lay the part over the copy with one helper each in
  `packages/core/lib/pageUserStates.ts`. On someone else's profile the part is whether the reader blocked the person,
  the owning team of each topic whose private team the reader belongs to, the reader's email switch on each topic
  they follow, and, for a reader in a user block, each topic card's reaction count without the people in one with
  them. The profile's news stays its own read, as the reader's. On a team page the reader is not a member of, it is
  the same topics' part with the reader's join request and unseen chat mentions; the released `/api/teams/:id/page`
  returns the copy and the part only to a read that asks with `?userState=1`, so a 0.1.0 app keeps its full read. On
  a public Topic Post the reader neither wrote nor may edit, it is the reactions of the post and of every listed
  comment and reply as the reader sees them, the comments they reported, whether they reported the image, the body
  without the images they reported, and, for a reader in a user block, the people in one with them and the thread's
  counts without those people, whose comments the helper leaves out of the shared thread. A profile topic's team
  and the profile teams' `isDefaultTeam` are the user's own: the first rides in the part, and the second shows only
  on the person's own profile, which keeps the full read. On Specials it is `hasFullAccess`. The person's own
  profile, an admin's read of it, a member's or invitee's team page, and the author's, an editor's, or an admin's
  Topic Post keep the full uncached read. The topic page keeps it for every signed-in reader, as D4 allows, and so
  does the podcast episode page, which shares the topic page's thread, listens, and permissions. The tests are
  `profilePageRead.test.ts`, `team/teamPageRead.test.ts`, `topicPost/topicPostPageRead.test.ts`, and
  `packages/core/lib/pageUserStates.test.ts`, which leaves a blocked author out of the shared thread.

### D5. The edge gets the new reads only after a tag can purge them and the rule names them

- **Chose:** a per-topic page tag and a team tag join `toPageCacheTags`, purged on a visibility change and a delete.
  The page reads send `renderedCacheHeaders` only then. Cloudflare's whole rule moves from an archived design into
  the deployment guide, each new path is a manual step there, and a read-only script requests each shared path
  twice and fails on `DYNAMIC` or `BYPASS`. The same rule gains the versioned public file paths whatever the cookie
  (finding P1), which the origin already marks public or private.
- **Why:** today a topic made private stays public at the edge for up to two minutes, because its page carries the
  `rendered` tag alone, and `/api/home` sends edge headers that Cloudflare ignores.
- **Rejected:** relying on the edge alone (a render and a crawler's first hit of a long-tail page never see it).

### D6. Budgets are counted on a fixture with a row in every branch

- **Chose:** a visitor's cold page read, on such a fixture: profile 25 (17 without its news), team page 17, visitor
  home 9, signed-in home 15 (23 with its news), topic 18 (25 with related rows and a comment thread), podcast
  episode 14 (20), Topic Post 5 (8 with comments), a Specials page 2 (4 with no share image). A warm visitor read
  sends none. Each page's render sends one request. The request budgets live in the web's route tests over one list
  in `packages/contracts`, which `queryBudgets.test.ts` also reads. Each page read's concurrent queries are held
  under a bound too (finding R10).
- **Why:** today's budget test holds the profile at 14 where the route sends 26, because its fixture returns no row
  to most reads. The request's aims (17, 19, 9, 15, 5) were set before the counts: the profile's 17 holds without
  its news, the team page beats its 19, and the topic head's 5 becomes none, because the head is built from rows
  the page already loads.
- **Applied (3.2 to 3.8, 3.15):** the budgets hold on a fixture with a row in every branch, in
  `apps/api/queryBudgets.test.ts` and `apps/api/pageReadBudgetTestFixtures.ts`: the person, a public topic with a
  succeeded scan, a shown Finding and a ready Source, a public team that holds it, its published podcast episode with
  a chapter and a ready film, a comment on every page, a related topic and a related podcast episode, and a published
  Topic Post with its discussion, with `PODCAST_SPEECH_MODEL` set. Each page read's concurrent queries are held under a
  bound that counts the queries in flight at once. Queries, then the most concurrent queries: profile 15 and 10, team
  page 11 and 8, visitor home 10 and 9, signed-in home 21 and 11, topic 24 and 9, podcast episode 19 and 5, Topic Post 8
  and 3, Specials 4 and 3. One's own Activity read is held at the profile's bound of 10, and sends 9 at once.
- **Grouped:** the topic head is built from the rows the topic page loads, so it sends no preview, last scan,
  Findings, or feed date read. The topic is read with its owner and the owner's access in one read. Its published and
  newest podcast episodes are one read, which the podcast and the page's reaction read share, so one reactions read
  covers the topic, its Findings, and its films' cards. The podcast episode page reads the podcast episode with its
  topic, scan, and owner in one row, which its head and its invite gate share, its Findings by its chapters' ids with
  the invite gate kept, and its films and favicons once. The Topic Post page reads the post with its topic's counts
  and its author's avatar, and one discussion row. The counts read, the view POST, and the image routes read a narrow
  access row with no body. The home reads every card of every kind together: one reactions read, one owners read,
  one latest podcast episode read, and one chapter count and films read over every podcast episode it shows. The
  home's ranked podcast episode read is two reads, featured and ranked (4.3), so the visitor home sends 10 and the
  signed-in home 21.
- **Above the aims, each read named:** the counts sit at or under the November 13 counts with comments and related
  rows (topic 25, podcast episode 20, Topic Post 8). What each page sends beyond its aim is a read that did not exist
  on November 13 or a branch the aim left out. The comment thread sends its replies, its counts, its mentions, and
  its comments' reactions after the first page of comments (4 on every page with a comment). The related topics and
  related podcast episodes send their ranking, the hnsw search setting, their rows, and the related topics' latest
  podcast episodes (4 on the topic page, 3 on the podcast episode page). The films send one read on each page that
  shows them, and the chapters one chapter read and one chapter count. A team topic sends its team bookmarks, the
  Findings their favicons and their comment counts, and the topic page its Topic Posts and the reader's Journal in its
  scans read. The signed-in home's 21 hold the 10 reads of the home's ids, which every reader shares for a minute, so
  a read on the shared ids sends 11, under the aim of 15. No page repeats a read of rows it already holds. Every page
  read sends no query on a warm visitor copy, and the request budget is one fetch per server load and none on
  hydration, both over `PAGE_READ_REQUESTS` in `packages/contracts/pageReadRequests.ts`.

### D7. A list pages on the server only if the request asks

- **Chose:** a request that asks for pages gets the first page and a count; one that does not gets today's whole
  list. The web asks, and loads ahead every page a visible page button opens, through one hook generalized from
  Your Topics'. The home's sections keep a link form of their page buttons, so a reader without JavaScript and a
  crawler can still reach every card. The topic page reads its newest 50 scans without their summaries, one summary,
  and the month's cost as a sum.
- **Why:** shortening an array passes the freeze check and still changes what a shipped build and a stored MCP view
  show.
- **Rejected:** the first page for everyone, and loading only the next page (a jump to a far page would still wait).
- **Applied (4.4, 4.5):** a topic read and a topic page read with `scans=newest` hold the newest 50 scans, without
  their summaries, and `scansPage` with how many scans the history lists. A page of the history leaves out a stopped
  scan in its read, so its pages and its count hold the scans the history shows. One row of the page includes the
  page's recap, the head's recap, the month's cost as a sum, and the count, so a poll's cache miss reads one summary.
  `GET /api/topics/:id/scans?page=N` returns a later page with its podcast episodes, and the scan-to-podcast-episode
  map and its podcast episode read cover the page's scans alone. The visitor's copy holds the newest page too, so a
  server render no longer holds every scan. The released `GET /api/topics/:id` without the flag keeps the whole list:
  a visitor's read takes it from the copy if the copy holds every scan, and reads the whole history if it does not,
  and a signed-in read and every MCP tool read it whole as before. The web and mobile topic pages ask for the newest
  scans on their page read, their reloads, and their polls. The scan history, five scans to a page on both apps, pages
  through core's `toTopicScanPages` over `useServerPagedCards`: every page a visible page button opens is read ahead
  from its server page of 50, and a page still loading shows the scan history's loading mug. The delete confirmation
  counts the history from `scansPage`. The page's last scan time and the head's last scan Findings come from the newest
  page, so a topic whose newest 50 scans all failed shows no last scan. A topic page read with `paged=1` holds one
  page of its Topic Posts and `topicPostsPage`, cut from the whole list, and `GET /api/topics/:id/topic-posts?page=N`
  returns a later page. The web and mobile topic pages ask for the Topic Posts' pages, and the web reads the page
  from the url's `posts` key.

### D8. The indexes that are built, and the one that waits (close)

- **Chose:** `episodes_published_at_idx`, partial on published rows, built by hand first. The finding count becomes a
  count over a `limit 3` subquery, with no new index. The latest podcast episode and the feed's last succeeded scan
  become lateral `limit 1` reads on indexes that exist. The listener ranking index is built only together with a
  split of the ranked read into featured and ranked, and only if the seeded plan shows the scan and sort matter.
- **Why:** the home's id reads run once a minute behind a 60-second key, so their indexes cut a fixed cost. An index
  over `listener_count` ends heap-only updates of a counter the sweep raises every run, on a table with two trigram
  indexes.
- **The EXPLAIN pass** runs on a Neon branch seeded to 25,000 users, never on dev, where the worker would scan seeded
  topics on real spend. Its reads join the plan smoke, so a later sequential scan fails a check.
- **Applied (4.7):** `loadLatestPodcastEpisodeRowTopics` reads `topics inner join lateral (... order by published_at
  desc limit 1) latest_podcast_episodes on true`, and the feed's `loadLastSucceededScanRows` reads `topics inner join
  lateral (... where status = 'succeeded' order by started_at desc limit 1) latest_scans on true`, with the recap
  subquery correlated to `topics.id`. The contract fixtures resolve a lateral alias to its inner table. Read-only
  EXPLAIN on dev, 100 topic ids, where every id is asked for, so `topics` is a sequential scan:
  - the feed's last succeeded scan: Nested Loop, then Limit over an Index Scan Backward using
    `scans_topic_started_idx` (Index Cond `topic_id = topics.id`, Filter `status = 'succeeded'`), and the recap
    SubPlan the same index backward;
  - the latest podcast episode: Nested Loop, then Limit over an Index Scan Backward using
    `episodes_topic_published_idx`.
  Each topic reads one index range to its first row, where the `distinct on` read sorted every row of every topic.
- **Applied (4.3):** `loadHomePodcastEpisodeIds` reads the featured podcast episodes (`home_order` set, by
  `home_order`, then listeners and published time) and the ranked ones (`home_order` null, by listeners and published
  time) as two reads of 60 each, and keeps the first podcast episode of each topic from featured then ranked. The
  ranked read is skipped if the home is featured-only.
- **Not built:** the listener ranking index. It waits on 4.9's seeded plan, which needs a Neon branch the user
  approves. Dev holds too few published podcast episodes for its plan to show whether the ranked read's scan and sort
  cost enough to pay for the lost heap-only updates of `listener_count`, so 4.3 stays open until that plan decides.

### D9. The News read changes nothing a client sees

- **Chose:** each own-group arm keeps its one select and today's filter and gains a filter on candidate ids read
  from the indexes inside the window. A read with a cursor skips the count and takes `total` from the cursor. A
  person's own first page is cached 60 seconds and cleared by their own writes, and the client invalidates its news
  query on the same writes. A null recap is stored under the recap's own key for 60 seconds.
- **Why:** the filter that decides a row is unchanged, so the result cannot drift, and `total` is required by the
  released contract.
- **Rejected:** separate `union all` arms (each repeats its joins and needs exclusions by hand).

### D10. A poll reads a status, and the page once when it changes

- **Chose:** three status reads after one prefix, `/api/status/`: a film's, a discussion's, and a Scan's (finding
  R12). Each is a `cacheJson` load of one row with a lifetime under a third of its poll, and the pipeline's status
  writes delete its key, so no workflow changes. The read returns the status alone. The client reads its page once
  when the status leaves in progress, and a failed status stops the poll. A public subject's status is read without
  credentials by everyone but the reader who is waiting; any other goes through the page's own access check.
- **Every waiting reader keeps today's interval:** 30 seconds for a film, 15 for a discussion, 3 for a Scan. A reader
  who may not scan the topic starts at 10 seconds. The web's linked podcast episode poll and the image render poll
  gain the hidden-tab pause and a limit, the topic page polls a newer film's status under an older film's filming
  line, the web keeps the shown topic if the polled payload is unchanged, and mobile passes the screen's focus.
- **Why:** a signed-in user's scan poll never hits its two-second cache at a three-second interval: 200 users watching
  one Scan send about 2,000 queries a second.
- **Rejected:** the worker writing the status value (one key with two writers), and a status read that returns every
  swap field (a film changes its page in five places, and a second copy of those shapes would drift).

## Risks / Trade-offs

- [A load that started before a write can store the old value after the clear] → the lifetime bounds it at 30 to 60
  seconds, as it does for the topic page today.
- [An edge header on a path Cloudflare's rule does not name does nothing, silently] → the check script.
- [A cached Topic Post entry holds its body, up to 512 KiB] → the counts read and the view POST stop reading the
  body (finding R14), and the entry is one per post.
- [The contract fixtures parse SQL text, and a lateral read would be matched as its outer table] → the fixtures
  change with the read.
- [A purge on every write] → one call carries every tag of a write, and the film backfill's swaps clear origin keys
  alone.
- [A dev-scale plan proves little] → the seeded branch.

## Migration Plan

Ship the code with the page reads at the origin cache only. Build `episodes_published_at_idx` by hand, then let the
release run its migration. Add each new path to Cloudflare's cache rule by hand, run the check script, and only then
turn the edge headers on for the page reads. Rollback is a deploy of the previous build: every old route is still
there.

## Open Questions

- **What Cloudflare forwards for a Worker's request** (D1). The task's probe answers it.
- **Whether this Cloudflare plan honors a three-second edge lifetime** on a poll read. If it does not, the origin's
  status key still makes each poll a key read.

## Appendix A: counts and measurements, taken 2026-11-13 at 32d3dded

Each entry was written as it was taken, read-only. The closing read's findings (A.25 to A.28) are in
`launch-hardening`'s design.

### A.12 The server render's rate limits (item 12), by reading and by live probes

The full evidence is in `launch-hardening`'s design, A.4. What this change rests on:

- **The skip does not rest on localhost.** `isUncountedRequest` (`apps/api/rateLimit.ts:111-114`) tests for no session
  and no `x-forwarded-for` entry that resolves to an external address. Nothing in the api reads the socket's peer
  address. A private-network fetch sends no header either, so the skip holds from the web service unchanged.
- **A server render reads 18 api routes**, each behind `apiRateLimiter` and four behind a limiter of their own
  (`topicFeedRateLimiter`, `socialReadRateLimiter` twice, `dashboardReadRateLimiter`, `searchRateLimiter`), all of
  which skip it. No route needs `isReadByPageRenders` set.
- **One in-route counter does not skip:** server-rendered visitor searches share one bucket of 20 query embeddings a
  minute (`apps/api/podcast/podcastEpisodeSearch.ts:35-36,234-241`).
- **Live probes:** on the origin's own hostname and through Cloudflare, a forged `X-Forwarded-For` of an internal or
  another address was counted under the sender's own key every time.
- **`TRUSTED_PROXIES` trusts every Cloudflare range**, the one a Worker's request to another zone arrives from
  included (production: 22 entries). What Cloudflare forwards for a Worker's request was not tested.
- **`pageRenderRateLimiter`** keys by address alone and skips a session cookie or an address that is not external. An
  address it cannot resolve is skipped, never pooled.
- **Tests that exist:** `apps/api/rateLimit.test.ts:58-342`. None shows a quiet limiter skipping an uncounted request,
  none covers the search limiter's skip, and none names the private-network shape.
- **Words to bring in line:** the comment at `apps/api/rateLimit.ts:109-110`, `apps/api/AGENTS.md:403-405`, and the
  living requirement "A page render's own api calls are never limited" all say "loopback", and that requirement's
  list of limits leaves out the Dashboard read limit the code already skips.

### A.13 Page reads and their caches (items 13, 14), by reading and by counting against the dev database

Counted by running each GET route in process against the dev database with the pool's `query` wrapped, writes
rejected, as a visitor (no cookie), cold then warm. A signed-in session lookup was replaced in process.

Claims that no longer match the code:

- **"The profile has no cache" is stale in three parts.** A visitor's first page of a profile's news is cached 60 s at
  the origin (`apps/api/news/newsRoute.ts:17-18,50-58`). Every rendered visitor page is shared at the edge for 60 s
  (`apps/api/index.ts:208`). The Visitors counts are shared at the edge for 30 s.
- **A visitor's home is already one read:** its render sends one request and its browser none of its own, and
  `/api/home` sends `renderedCacheHeaders` with its seven id reads cached 60 s.
- **Row 63 added no query to the profile, team page, or home.** The Visitors lines shipped on November 10 and the
  Specials links are built in the browser.
- **"The topic page arrives in one read" is stale in part.** The page payload is one read, but the loader still sends
  the head as a second request (`apps/web/src/routes/_layout/-topicRoute.ts:40-43`), and the head is never cached,
  so a warm topic render still runs the head's 8 queries.
- **The topic page's cache is cleared by no worker write.** A Scan's Findings, a published podcast episode, a film's
  ready swap, and a re-render's swap wait out the 30 s, and so does `DELETE /api/episodes/:id`.
- **Topic Post body images have no rows.** The ids, width, and height live in the saved body's `<img>` tags. A
  visitor and the author cost no query; a signed-in reader costs one query for all reported images.
- **A podcast episode page is 27 queries** (head 4 + page 23), never 26.
- **`toTopicEditRole` is outside the request memo**: measured 3, 2, and 3 runs on the topic, podcast episode, and
  Topic Post pages. No read of the profile, team page, or home calls it.
- **The budget test hides most of each page.** Its fixture returns no row to most reads, so reads that only run with
  rows never run: it holds the profile at 14 where the real route sends 26, and the topic page at 21 where real data
  sends 35 to 40 (`apps/api/queryBudgets.test.ts:43-63,243-248`).

A visitor's cold load today:

| Page | Server render requests | Queries, cold | Queries, warm | The browser then reads |
|---|---|---|---|---|
| Profile | 3: head 4 + profile 26 + news 11 | 41 | not run | counts 1, team statuses (a 401 for a visitor) |
| Team page | 2: head 3 + page 28 | 31 | not run | counts 1, notes |
| Home | 1 | 13, or 20 with cold ids | not run | none |
| Topic | 2: head 8 + page 26 | 34 (38 with related rows) | 8 + 0 | counts 1, notes 2 |
| Topic, url names `?season` and `?filmSeason` | 4 | 40 | 14 | the same season again, 3 |
| Podcast episode | 2: head 4 + page 23 | 27 | 4 + 19 | counts 1 |
| Topic Post, three body images | 2: head 5 + page 7 | 12, 15 with a comment | the same | counts 1 |
| Specials, a person | 2: head 5 + default 2 | 7 | 7 | the default selection again, 2 |
| Specials, a team | 2: head 4 + default 2 | 6 | 6 | none |

Signed in, never server rendered and never cached: the home 22 plus its news 10 (the recap was not run); one's own
profile 6 GETs and 77 queries, of which `/api/activity` is 30 in 16 sequential stages (950 to 1,300 ms) for the one
field the page reads from it; the topic page 35 to 40; the podcast episode page 31 or 32; a Topic Post 12 to 14.
Response sizes: topic page 211 KB, podcast episode page 95 KB, Topic Post 25 KB, profile 78 KB, team 24 KB, home 172
KB. MCP tools: `read_profile` 39 as a visitor and 46 as a user (it calls `readNews` directly and never reads the
news cache), `read_team` 32 and 38, `read_topic_feed` 16 and 25 (it reads the Findings twice), and `edit_topic` runs
the 45-query topic page once per preview and twice per save.

The repeats, each confirmed by the run:

- A profile render reads each topic's latest podcast episode three times, reactions three times, the films table five
  times, the chapters table five times, the person's row four times, and the person's topics three times.
  `toProfilePreview` awaits four queries in sequence (`apps/api/share/preview.ts:203-218`).
- The team page reads reactions four times, the films four times, the chapter counts four times, calls
  `loadPodcastEpisodeCards` twice, and re-reads topics it already holds (`apps/api/profileCards.ts:122-126`).
  `loadTeamSummaries` runs five awaits (`apps/api/team/helpers.ts:177-215`).
- The home reads reactions three times and, signed in, runs `toTopicCards` twice.
- The topic head and page together read the topic row four times and the published podcast episodes twice.
- The podcast episode page reads the podcast episode row three times, the films twice, and loads up to 1,000 Findings
  to keep the ones its chapters narrate (`apps/api/topic/findings.ts:34`).
- The Topic Post render reads the post row with its body twice, and the counts read and the view POST each read the
  whole body again (`apps/api/topicPost/topicPosts.ts:81-86`), up to 512 KiB.
- The Specials head and default selection read the person's row three times and the summary row twice, and the
  browser reads the default series the server already read and dropped.

Counted again on November 20 for task 3.1, before any change, by the same method on the dev database with Redis off,
as a visitor. The budgets in tasks 3.2 to 3.8 are set from these counts, not from November 13's:

| Page | Server render requests | Queries, cold | Most concurrent queries |
|---|---|---|---|
| Profile | 3: head 4 + profile 27 + news 11 | 42 | 12 |
| Team page | 2: head 3 + page 28 | 31 | 10 |
| Home | 1 | 21 | 8 |
| Topic | 2: head 8 + page 30 | 38 | 12 |
| Podcast episode | 2: head 4 + page 20 | 24 | not taken |
| Topic Post | 2: head 5 + page 10 | 15 | not taken |
| Specials | 2: head 5 + default 2 | 7 | not taken |

Signed in on November 20: the home 25 and its news 15; someone else's profile 36, one's own 55 with `/api/activity` 38;
someone else's topic 53 with at most 27 concurrent queries, one's own 54; a podcast episode 30; a Topic Post 16; a team
31.

One page read can hold most of a replica's pool: a profile read holds 11 statements in progress at its peak, a team
page 10 to 11, and a cold topic page starts about 20 in one `Promise.all` (`apps/api/topic/topics.ts:81-123`),
against a default pool of 15, with 16 visitor renders at once a replica.

Counted again on November 20 after tasks 3.2 to 3.8, by the same method with each GET request run in its request
memo and its row memo as the server runs it. Each page's server render now sends one request, its page read:

| Page | Queries cold, before | Queries cold, after | Most concurrent queries, after |
|---|---|---|---|
| Profile | 42 | 28 | 13 |
| Team page | 31 | 17 | 8 |
| Home | 21 | 20 | 7 |
| Topic | 38 | 31 | 15 |
| Podcast episode | 24 | 22 | 9 |
| Topic Post | 15 | 14 | 9 |
| Specials | 7 | 4 | 3 |

What still repeats on these pages: the reactions are read up to three times a page, once a stage for different
targets; the films are read once a stage for different podcast episodes; the topic head reads the topic's preview,
its last scan, that scan's Findings, and its feed date apart from the page; and the podcast episode head reads its
published podcast episode apart from the page's read of it. A warm visitor copy sends none.

One's own Activity read (task 3.13), signed in, after its independent reads were put together: 38 queries with at
most 18 concurrent, in 752 ms, where it took 16 sequential stages and 950 to 1,300 ms. Its reads then ran in two
stages, which send 9 at once on the budget fixture, under the profile's bound of 10 and the default pool of 15. One's
own profile reads its topic rows from its page read and sends no Activity request.

The MCP tools (task 3.14), cold with Redis off, as a visitor and then signed in as someone else: `read_profile` 36 and
51, `read_team` 21 and 28, `read_topic_feed` 12 and 17. A visitor's `read_profile` and `read_team` read the page
reads' visitor copies, so a warm copy leaves only the MCP view's own reads. A user's `read_profile` reads the news
through the news caches. `read_topic_feed` reads the topic's Findings once, and its MCP view takes them from that
read.

Facts the design rests on:

- **`cacheJson`** (`packages/db/redis.ts:127-173`) takes `{ key, ttlMs, load, isStorable? }`, shares one load per key
  within a process, has no lock across replicas, and on a Redis failure loads and stores nothing. A cache the worker
  must clear keeps its keys in `packages/db`, as `packages/db/podcastFeedCache.ts:16-39` does, because the pipeline
  cannot import an app. The visitor topic page's key lives in `apps/api/topic/feedCaches.ts:74-76` today.
- **`renderedCacheHeaders`** (`apps/api/edgeCache.ts:43-58,183-186`) shares only a 200, 301, or 308 with no session
  cookie, no `Authorization` header, and no `Set-Cookie`. Routes that send it today: `/api/topic-feed`, `/api/home`,
  the blog and release pages, and every rendered page. **`toPageCacheTags`** (`:68-81`) knows `home`,
  `profile:<userId>`, and `topic-post:<id>`. It has no team pattern, and the topic page and the podcast episode page
  carry `rendered` alone, so nothing can purge them: a topic made private stays public at the edge for up to 120 s,
  and 240 s while the origin errors.
- **A server render never passes the edge**, so only the origin cache protects a render. An edge header on a JSON
  route helps a visitor's navigation inside the app, and does nothing until Cloudflare's rule names the path (O7).
- **Every page's visitor response is the same for every visitor.** What depends on the reader is listed per page in
  the research: on a profile the non-public topics, the block, the email switches, the teams, the cards' team link
  and reaction count; on the topic page some thirty fields, the comment thread's per-comment permissions and the
  authors a user block hides among them; on a Topic Post the image, the html (a reported body image is taken out),
  the own reaction, and the permissions; on a Specials page only the access level.
- **Writes that change a page and clear nothing today:** a username change, an avatar change, a team membership
  change, a new podcast episode, both film swaps, a Topic Post edit (`PUT`), a discussion's publish or failure, and
  a Topic Post summary. The pipeline's sites run inside activities, so a Redis delete there needs no `patched`.
- **How the topic page passes its payload to the browser:** the loader returns it, TanStack Start carries the loader
  data in the HTML, the page reads it with `useMatch(...).loaderData`
  (`apps/web/src/hooks/useTopicPagePayload.ts:32-42`), and `useLoadInBrowser` skips the first browser load. There is
  no query client hydration: a query that starts from server data takes it as `initialData`.
- **The released snapshot** `contracts/0.1.0.json` (191 routes, frozen 2026-11-12) is enforced by the freeze check
  though `contracts/releases.json` is `[]`. It names every data route of these pages (`GET /api/profiles/:userId`,
  its news and team statuses, `GET /api/teams/:id/page`, `GET /api/home`, the topic, podcast episode, Topic Post,
  and Dashboard reads, the counts, and the view POSTs) and no head route. A new optional response field passes.
- **A failed read marks a render degraded, which the api turns into a 503** (`apps/web/src/lib/loadOnServer.ts:35-45`).
  A part folded into a page read (the news) returns null on its own failure instead of failing the read.
- **A request budget cannot live in the api's test**, because an app never imports another app. The web's route tests
  already load a route the way the server does over a fake `fetch` (`apps/web/src/routes/-loadRouter.ts:16-26`).

Found outside the items:

- **High: `GET /api/activity` on one's own profile** runs 30 queries in 16 sequential stages for its `topics` field
  alone (`apps/web/src/pages/ProfilePage.tsx:116-136`, `apps/api/activity.ts:35-81`). Every person who signs up in the
  wave lands on their own profile.
- **High: one page read can hold most of a replica's pool** (above).
- **Medium: a topic made private stays public at the edge for up to two minutes** (above).
- **Medium: the Topic Post counts read and view POST select the whole body** (above).
- **Low:** a `?season=` url fetches the season twice; a Specials page keeps a stale name for up to a day; a removed
  podcast episode stays on the visitor topic page for up to 30 s; a warm visitor news read still sends one query.

### A.15 Reads that grow, and the News read (items 15, 16), by reading and by EXPLAIN on dev

Dev rows today: topics 101 (21 public and shown), scans 3,132 (320 on one topic), findings 937 (78 on one topic),
episodes 416, topic posts 12, comments 45, reactions 50, `daily_view_counts` 2,665. Every table but `resources` is
under 5,000 rows, so the planner prefers sequential scans and dev-scale plans prove little.

Claims that no longer match the code:

- **"Leave a post's body out of every list read" is already done** since November 10: every list reads
  `topicPostCardColumns` (`apps/api/topicPost/topicPosts.ts:46-55`), asserted by `topicPosts.test.ts:128`. The three
  lists still have no limit.
- **The `isPagedOnServer` path does not load the next page ahead.** A page is requested when it is opened
  (`packages/core/hooks/useYourTopicsPages.ts:25-31`). The early load is new work.
- **The home's seven id reads run about once a minute, never once a request:** they sit behind one 60-second key
  (`apps/api/home/homeCardIds.ts:22,52-54`), so their indexes cut a fixed cost that grows with the table.

Today's plans on dev (`EXPLAIN` without `ANALYZE`):

| Read | Plan | Where |
|---|---|---|
| Finding count in `isPublicAndShown` | a count over every Finding of the topic, cost 45.76 a topic; about 13.3 in either bounded form | `packages/db/index.ts:124-131` |
| Home ranked and newest podcast episode and film ids | `Seq Scan on episodes`, then `Sort`, in all four reads | `homeCardIds.ts:119-218` |
| Topic page scans | `Seq Scan on scans`, `Sort`; the busiest topic reads 320 rows, about 156 KB, to use one summary, on a poll's cache miss too | `apps/api/topic/topics.ts:92,264-282` |
| A topic's, a person's, a team's Topic Posts | `Seq Scan on topic_posts`, no limit | `topicPosts.ts:134-155` |
| Latest podcast episode per topic | `distinct on`: `Seq Scan on episodes`, `Sort`, `Unique`, 172 rows for 12 topics, twelve callers | `apps/api/podcast/podcastEpisodeShapes.ts:369-373` |
| The feed's last succeeded scan per topic | `Seq Scan on scans`, `Sort`, `Unique`, 877 rows of 348 bytes for 25 topics | `apps/api/topic/feedData.ts:192-209` |
| News, the own group | one statement that binds 378 values for a person with 34 topics, cost 4229, and walks every comment and reaction in the window | `apps/api/news/newsEventRows.ts:141-159` |

Other numbers: the home holds up to 348 cards (12 + 12 + 100 + 12 + 100 + 12 + 100) for 42 shown, 81 on dev today
(`apps/web/src/components/common/CardsSection.tsx:35`). `daily_view_counts` and `daily_play_counts` have primary keys
that already cover item and day. The role's `statement_timeout` is 30 s.

Facts the design rests on:

- **`episodes` has no index on `published_at` alone**; `episodes_topic_published_idx (topic_id, published_at)` is the
  only index that holds it. An index over `listener_count` ends heap-only updates of that counter, which the sweep
  raises for each changed podcast episode, so every such update would write to every index on the table, two GIN
  trigram indexes among them (`apps/worker/syncViewerCounts.ts:215`).
- **Whole lists are in released shapes.** `TopicResponse.scans` and `topicPosts`, the profile's and the team's Topic
  Post cards, and the home's three newest lists are arrays that hold everything today, and the clients count and
  page them on the device. Shortening one passes the freeze check and still changes what a shipped build and a
  stored MCP view (version 11) show. So paging is asked for by the request, and a request that does not ask gets
  today's whole lists.
- **The web keeps every home card in the html on purpose**, for crawlers (`CardsSection.tsx:17-18`). `Pagination` has
  a link form that shows without JavaScript for a server-paged list (`Pagination.tsx:22-34,120`), and the sitemap
  lists every public topic, podcast episode, and Topic Post.
- **The contract fixtures parse SQL text** (`apps/api/contractFixtures.ts:218`): a lateral read `from "topics" inner
  join lateral` would be matched as `topics`, so the fixtures change with the lateral latest podcast episode read.
- **A failed concurrent index build leaves an invalid index that `IF NOT EXISTS` then skips.** The by-hand session
  needs `set statement_timeout = 0`, and `pg_index.indisvalid` is checked before the deploy.
- **The News contract requires `total`** on both news routes in `contracts/0.1.0.json`. A read with a cursor already
  discards the fresh count and takes the cursor's totals (`apps/api/news/readNews.ts:88`), so dropping the
  `count(*) over ()` on a cursor read changes no response.
- **The browser keeps its own news page for 60 seconds and nothing invalidates it after a write**
  (`packages/core/hooks/useNews.ts:7,68`). Clearing the server's key alone shows a person their own activity on a
  reload, never in the session that wrote it.
- **A null recap is never stored** (`apps/api/topic/updatesRecap.ts:45`), so a person with nothing unread repeats
  the 500-row unread read on every full page load, a spent budget repeats two database reads and the reservation,
  and a failing model repeats the call and an error report. Four tests assert the old rule.
- **A launch-scale EXPLAIN pass seeds a Neon branch, never dev**, because the dev worker would scan seeded topics on
  real spend. The request names no user count; the research sized its estimate at 25,000 users.

Found outside the items:

- **High: the Topics feed reads every succeeded scan, with its summary, of every listed topic**
  (`feedData.ts:192-209`), uncached for a signed-in person. At a year of daily scans, 100 topics is 36,500 rows
  sorted to keep 100.
- **Medium: the topic page reads every published podcast episode of the topic, their films, and a chapter count for
  each scan's podcast episode** (`apps/api/podcast/podcastEpisodeRows.ts:203-209`), on every load and poll miss.
- **Low:** the nightly Dashboard listing reads the whole 365-day window of both daily count tables under the
  30-second statement timeout; a scan's review reads every published post's body for its topic
  (`packages/pipeline/attach.ts:269-273`); the news binds each Topic id once an arm.

Task 4.8, the nightly Dashboard build's daily count reads, by `EXPLAIN` on dev on 2026-11-20 (365-day window, one
person and one team with views and plays). `daily_view_counts` has the primary key `(item_kind, item_id, day,
place_key)` and `daily_play_counts` has `(podcast_episode_id, format, day, place_key)`:

| Read | Plan on dev | With hash and merge joins and bitmap scans priced out |
|---|---|---|
| A topic's views, person and team | `topics` by owner or `topics_team_id_idx`, then the primary key with `item_id = topics.id` and the day range | the same |
| A finding's views, person and team | `findings_topic_created_idx`, then the primary key with `item_id = findings.id` and the day range | the same |
| A Topic Post's views | the primary key with `item_kind` and the day range alone, estimated at 1 row, then `topic_posts_pkey` and `topics_pkey` filtered by owner | the same, because dev's statistics hold almost no Topic Post views |
| A podcast episode's plays | `Seq Scan on daily_play_counts` over the window (662 rows), then `episodes_pkey` and a hash join to the owner's topics | `topics_owner_id_idx`, `episodes_topic_published_idx`, then the primary key with `podcast_episode_id = episodes.id`, the formats, and the day range |
| The nightly listing of Dashboards | `Seq Scan` of both tables over the window, then the item reads by primary key | not run: the listing reads the whole window by design (the Low finding above) |

The topic and finding reads use the primary key over item and day. The play read and the Topic Post read take the
window first only because the dev tables are small: the play read's item-driven plan exists and uses the primary key
over item and day once the window costs more than the owner's podcast episodes, and the Topic Post read can take the
same path through `topic_posts_topic_published_idx`. No index is added. Task 4.9's seeded branch confirms the plans at
launch scale.

### A.17 Polls and the layout's requests (items 17, 18), measured on the dev api's `Server-Timing` header

Claims that no longer match the code:

- **The topic page's film section does not poll while a newer film renders.** 8cb46ed added a filming line under the
  ready film's player and no poll, so that line stays until the page is read again. The section polls only while the
  film it shows is rendering, on a topic with no ready film
  (`packages/core/components/TopicVideoSection.tsx:100-106,124`).
- **"Polls forever" is bounded by the sweep.** The client has no limit, but the sweep fails a dispatched scan after 2
  days 21 minutes. A waiting scan is never failed and polls like a running one: the page's scan has no field that
  says it is waiting (`packages/contracts/topics.ts:144-161`).
- **The film, discussion, and scan polls already pause in a hidden tab** and read at once when the tab shows again
  (`packages/core/lib/limitedPoll.ts:18-25`, `apps/web/src/lib/visiblePoll.ts:6-15`). The polls that do not pause are
  the web's `?episode=` poll and the topic image render poll (`packages/core/hooks/useTopicImageRender.ts:44-79`).
- **A film row is `rendering` only once the render activity starts.** While a new podcast episode's film waits for a
  slot it has no row, its page shows no filming card, and no poll starts.

Every poll, measured where a count is given:

| Poll | Reads | Interval | Mounts for | Pauses hidden | Limit | Queries a poll |
|---|---|---|---|---|---|---|
| Film render, podcast episode page | the whole podcast episode page | 30 s | everyone on the page | yes | 4 h a mount | visitor 26 (22 warm), signed in 31; 97 KB |
| Film render, topic page | `topics/:id?poll=1` | 30 s | everyone on the page | yes | 4 h a mount | visitor 18 on a miss, 0 on a hit; signed in 31, and every poll misses; 210 KB |
| Topic Post Discussion | the whole Topic Post page with its comment thread | 15 s | everyone on the page | yes | 45 min a mount | visitor 10, signed in 17 |
| Scan | `topics/:id?poll=1` | 3 s, 10 s after 30 s, 30 s after 2 min | everyone on the page, visitors too | yes | none | as the topic row above |
| Linked podcast episode `?episode=` | `/api/episodes/:id` | 5 s | everyone who opens such a url | web no, mobile yes | none | visitor 3, signed in 7 |
| Counts | `/api/counts/...` | 60 s | everyone on the page | yes | none | 1 without credentials (the edge shares it 30 s), 4 with a cookie |
| Note badges | `/api/note-badges` | 45 s | signed in | skips a tick | none | 5 |
| Update badges | the mention count, the pending invites, and for an admin the report count | 45 s | signed in | yes | none | 1 to 2, and 3 |
| Topic image render | `/api/topic-image-renders/:id` | 3 s | the editor who started it | no | 20 min | not measured |

The topic poll is read through a two-second Redis cache keyed by user, or one key for every visitor
(`apps/api/topic/topicsRoute.ts:31,124-127`). A signed-in user's fastest interval is 3 seconds, so one user in
one tab never hits their own key: every poll is a full load of 31 queries and 210 KB. On the web the scan poll also
runs while a podcast episode records, and for 90 seconds after a scan succeeds with no podcast episode yet
(`apps/web/src/components/topic/TopicScanButton.tsx:26,29-48,79-82`).

A signed-in, non-admin layout on a cold full page load, in order:

| # | Request | Trigger | Queries |
|---|---|---|---|
| 1 | `GET /api/topic-feed?all=true` | the feed query mounts before the session is known | 28 |
| 2 | `GET /api/auth/get-session` | Better Auth's `useSession` | 2 |
| 3 | `GET /api/rooms/mention-count` | the update badges' first read | 2 |
| 4 | `GET /api/invites/topics/pending` | the same poll | 3 |
| 5 | `GET /api/comment-mentions/unseen` | on the session and on every path change | 2 |
| 6 | `GET /api/note-badges` | the note badges | 5 |
| 7 | `GET /api/topic-feed?all=true` | the same query under its new key | 26 |
| 8 | `GET /api/rooms` | the first mention count counts as a change | 6 |

**8 requests and 74 queries at load, then 3 requests and 9 to 10 queries every 45 seconds** from two timers. An admin
adds the report count. The feed is 698,048 bytes signed in and 600,870 for a visitor, the largest payload on every
page. A visitor's layout sends `get-session` and the feed on every page but `/topics`, whose loader seeds it; a
visitor's profile view also sends team-statuses, which returns 401. The feed context's readers that need its data
are three: the Topics page, the tags row (on the Topics and search pages), and the Edit topic dialog. Eight other
consumers read only the filters, the handlers, or `reloadTopicFeed`.

Facts the design rests on:

- **A status read already exists as a pattern:** `GET /api/topic-image-renders/:id` returns a status and the fields
  the editor swaps in (`apps/api/topic/topicImagesRoute.ts:84-101`).
- **Every status write of a film is in one pipeline module** (`topicVideoRows.ts:45-229`) **and every one
  of a discussion in another** (`topicPostDiscussions.ts:63-313`), so a Redis delete there changes no workflow, and
  the live render, the backfill, and the reaper all get it. The render already deletes the film feeds' cache at
  the ready write.
- **`cacheJson` already falls back to the row**: a failed Redis read runs the load and stores nothing.
- **The film's page changes in five places when a film lands** (the card, the film feed url, the films list, an
  editor's film image fields), so a status read that returned every swap field would be a second copy of those
  shapes.
- **An MCP view mounts the discussion card** and cannot reach the api
  (`apps/web/src/mcpViews/TopicPostMcpView.tsx:23-30`), so a status read is passed in by the page, never called from
  inside the core hook.
- **The web sets a new topic object on every poll** (`apps/web/src/hooks/useTopicPagePayload.ts:83,160-168`).
  `replaceEqualDeep` from `@tanstack/react-query` returns the previous object if nothing changed. The mobile app
  already gets this from `queryClient.setQueryData`.
- **A signed-in request costs one query before its route runs**, so a public status read omits credentials, as the
  counts do, for everyone but the reader who is waiting.
- **Released builds** read `fetchNoteBadges`, `fetchChatMentionCount`, `fetchChatRooms`, `fetchTopicInviteBadges`,
  `fetchUnseenCommentMentions`, and `fetchOpenReportCount`, all named in `contracts/0.1.0.json`. All six stay.
- **A living spec forbids a timer for Comment Mentions:** "SHALL never read it on a timer", with a scenario that ends
  "and no read ran in between" (`openspec/specs/comment-mention-badges/spec.md:124-140`). The read behind it is a
  five-minute cache that every writer clears.
- **`reloadTopicFeed` calls `refetch`, which fetches a disabled query too** (`useTopicFeedState.ts:156-159`), and the
  web's `pendingChanges` is a new `[]` each render (`packages/core/hooks/useTopicFindingActions.ts:108`), which
  breaks a memoized value. A signed-in feed query's stale time is 0, so a prefetch needs a few seconds of it.

Found outside the items:

- **High under a wave: a signed-in user's scan poll never hits its cache.** Two hundred followers watching a
  topic's morning scan send about 2,000 queries a second for its first 30 seconds, then 62 a minute each for as long
  as the scan and its podcast episode run. The MCP view's `read_scan_status` already reads the scan row's status,
  counts, and `pickedUpAt` alone (`apps/api/mcp/scanResults.ts:140-146`).
- **Medium: the scan poll reads the whole topic page for hours while a podcast episode records** on the flex tier.
- **Medium: a queued film shows nothing and starts no poll** (above), and a film whose workflow is lost before its
  first row write has no row for the reaper to find.
- **Medium if the wave is signed in: the badge poll's query cost barely drops with one route.** The note badges' 4
  queries and the invitations' 2 stay: ten thousand open signed-in tabs are about 1,800 queries a second.
- **Low to medium: visitors behind one address share the scan poll's rate limit** of 1,800 requests a minute.
- **Low:** the Edit topic dialog and the tags row read the tags and four quota numbers from the 698 KB feed; the
  Personal sources polls have no limit.

## Appendix B: the apply's oha run, taken 2026-11-20

Task 8.2 ran `oha -z 20s -c 8` on four public pages, on origin/main at 0d3e3b19 and on this change, both on this
laptop against the dev database. Throughput rose 2.5 to 8 times, p99 fell 2.6 to 15 times, and a
visitor's page went from 7 to 33 queries to none but the visitor copy's refill. The table and each run's json are in
`logs/launch-hardening/page-reads/oha/`.

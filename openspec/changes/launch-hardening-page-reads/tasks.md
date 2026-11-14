# Tasks

Part B of the launch hardening work. Groups 1 to 6 are the request's items Twelve to Seventeen, one group each.
Group 7 holds findings from the closing read, each marked with its id from the findings table in
`launch-hardening`'s design. Group 8 is the integration checks. This change ships after `launch-hardening`. It adds
no workflow step: every cache and status clear sits inside an existing activity or route. The one new index on an
existing table is two steps: the by-hand concurrent build in production, then the migration in migration 0119's
shape.

## 1. The server render's rate limits after the split (item 12, with findings S2 and R22)

- [ ] 1.1 Add tests to `apps/api/rateLimit.test.ts`: each quiet limiter and the search limiter pass a burst of
      requests with no user and no forwarded header, and the same with a private web address in the header; a
      visitor's chain of an internal entry then an external one is still counted under the external one. Verify:
      the tests pass with no limiter change
- [ ] 1.2 Add a test beside the web client's base url test that the server configuration sets no forwarding header.
      Verify: the test fails if a header is added
- [ ] 1.3 (finding S2, close) Resolve the client address from `cf-connecting-ip` if the hop that reported the client
      is a trusted Cloudflare address, for the limiters and for Better Auth's own limiter. Verify: unit tests for a
      direct request, a request through Cloudflare, and a chain whose every entry is trusted
- [ ] 1.4 (finding S2) Probe a real Cloudflare Worker, read-only: send `GET /api/search?q=test` through it with and
      without a forwarded header and read the limiter's remaining count. Verify: design.md records what Cloudflare
      forwards and whether a relayed request is counted; if it can still resolve to nothing, the signed mark in D1
      is opened as its own change
- [ ] 1.5 (finding R22) Skip the visitor query embedding count for a request the search limiter skips. Verify: a
      test that server-rendered searches do not share one bucket
- [ ] 1.6 Reword "loopback" in the comment at `apps/api/rateLimit.ts:109-110`, `apps/api/AGENTS.md`, and the README:
      a call that brings no session and no external address, over loopback or the private network. Verify: a grep
      for "loopback call" finds nothing stale
- [ ] 1.7 By hand after `launch-hardening`'s routes exist: repeat the forged-header probe against the web service
      and through Cloudflare, and read the web log for a trusted proxies warning. Verify: both are counted, and no
      warning is logged

## 2. Cache the new visitor pages (item 13, with finding R11)

- [ ] 2.1 Add `packages/db/visitorPageCaches.ts`: the keys for a visitor's profile, team page, home, topic page,
      podcast episode page, Topic Post page, and Specials page; their lifetimes (60 seconds for the profile, the
      team page, the home, and Specials, 30 for the other three); and `clearVisitorPagesOfTopic(topicId)`, which
      reads the topic's owner, teams, published podcast episodes, and published Topic Posts and deletes every key
      in one call. Move the visitor topic page's key here from `apps/api/topic/feedCaches.ts`. Verify: unit tests
      of the keys and the clear, and the boundary check
- [ ] 2.2 Read each page read's visitor branch through `cacheJson`, filled only by a load with no user, never
      storing a gated or missing result. Verify: `queryBudgets.test.ts` shows no query on a warm key for each page,
      and a test that a view POST after a cached read still counts its view
- [ ] 2.3 Call `clearVisitorPagesOfTopic` behind the two existing topic clear helpers, and at the pipeline's writes:
      a podcast episode's publish and removal, a film's ready swap and a re-render's swap, a film rebuild, the
      topic, podcast episode, and Topic Post image renders, a discussion's publish and failure, a Topic Post's
      edit, a body image taken down by an admin, and a Topic Post summary. The film backfill's swaps clear origin
      keys only. These sit in activity bodies, so no `patched`. Verify: a test for each site that the cached page
      is gone after the write
- [ ] 2.4 Clear a profile's key on a username change, an avatar change, a profile pin, and an account close, and a
      team's key on a team edit, a membership change, and a topic added or removed. Verify: a test that an owner's
      write clears the cached pages that show it
- [ ] 2.5 (finding R11) Add a per-topic page tag and a team tag to `toPageCacheTags`, on the topic page, the podcast
      episode page, and their page reads, and purge the topic's tag on a visibility change and a delete, in one
      purge call with the write's other tags. Verify: `edgeCache.test.ts`, and a test that a topic made private is
      purged
- [ ] 2.6 Send `renderedCacheHeaders` on the page reads whose visitor response is the same for everyone, behind a
      setting that is off until group 7's Cloudflare rule names their paths. Verify: tests that a response a
      session or a bearer token shaped is `private`, and that a view POST and an audio or film hop never carry a
      shared cache header
- [ ] 2.7 Docs: `apps/api/AGENTS.md`, `apps/api/reading-and-chat-routes.md`, `packages/db/AGENTS.md`,
      `packages/pipeline/AGENTS.md`. Verify: each names the cache module and what clears it

## 3. One read per page, and group each page's queries (item 14, with findings R9, R10, R14)

- [ ] 3.1 Count every page's requests and queries again on a cold load with the scratch method in A.13, before
      anything changes. Verify: the counts are recorded in design.md beside A.13's
- [ ] 3.2 Group the profile's loaders: read the person, the topics, the subscribers, the teams, and the posts
      together; one latest podcast episode read, one films read, one chapter count, one `loadReactionSummaries` for
      every kind; the preview built from rows the page holds. `loadProfile` keeps its return shape for the old
      route and `read_profile`. Verify: the old route's contract test passes, and its budget on a full fixture is
      19 or under
- [ ] 3.3 Group the team page's loaders the same way: `loadTeamTopics` as one read, `loadTeamCards` taking the rows
      it is given, one podcast episode cards read, `loadTeamSummaries`' later stages together. Verify: budget 16
      or under on a full fixture
- [ ] 3.4 Group the home's loaders: one reactions read, one films read, one chapter count, and `toTopicCards` run
      once over both topic sets for a signed-in home. Verify: budgets 9 and 15 on a full fixture
- [ ] 3.5 Group the topic page: the head built from rows the page loads, one read for the topic with its owner, one
      for its podcast episodes, one reactions read; memoize `toTopicEditRole` when it runs on the pool. Verify:
      budget 18 on a full fixture, and one role read on a team topic
- [ ] 3.6 Group the podcast episode page: one read for the podcast episode with its topic, scan, and owner; the
      Findings by its chapters' ids, with the invite gate kept; one films read; one favicons read. Verify: budget
      14, and a test that an invite topic's gate still applies
- [ ] 3.7 (finding R14) Group the Topic Post page: one read for the post with its topic's counts and its author's
      avatar, one discussion read, and the narrow access row for the counts read, the view POST, and the image
      routes. Verify: budget 5 (8 with comments), and a test that the counts read selects no body
- [ ] 3.8 Group the Specials page: the subject and the snapshot rows for the summary and the default selection
      together, with the head built from the public rows only, also if the owner asks. Verify: budget 2 (4 with no
      share image)
- [ ] 3.9 Add the page routes with their contracts, clients, and registry entries: `/api/profiles/:userId/page`,
      `/api/topics/:id/page`, `/api/topics/:id/episodes/:season/:episodeNumber/page`, `/api/topic-posts/:id/page`,
      `/api/dashboards/:dashboardKind/:subjectId/page`, each returning the head with the page; add the head and
      the saved Visitors count to `/api/teams/:id/page`; let a signed-in `/api/home` request ask for its first news
      page. A folded part returns null on its own failure. The head for a private or invite topic stays a card with
      no findings, no summary, and no prompt. Verify: contract tests, the freeze check, and a test that a failed
      news read still returns the profile
- [ ] 3.10 Switch each web loader to its one page read, pass the payload to the page through the loader data, start
      the counts poll from the saved count a minute later, and remove the six head routes, their clients, and their
      parity rows once nothing reads them. Keep the 404 and noindex rules the heads carried. Verify: route tests
      assert one fetch per server load and none again on hydration for each page, and `bunx knip` passes
- [ ] 3.11 Serve signed-in readers: the owner, an editor, an admin, and any reader of a subject that is not public get
      the full uncached read behind one session read, one access check, and one request memo; every other signed-in
      reader gets the visitor payload and an uncached `viewer` part. Ship the profile, the team page, the Topic
      Post, and the Specials page first. Verify: a test that no session-shaped response is cached, and that a
      blocked author is filtered from a shared thread
- [ ] 3.12 (close, design D4) The topic page's `viewer` part: its thirty viewer fields and its filtered comment
      thread. If it proves too wide, a signed-in reader of a topic page keeps the full uncached read. Verify: the
      choice and its reason are recorded in design.md, with a test either way
- [ ] 3.13 (finding R9) Return the person's topic rows from their own profile's page read instead of
      `/api/activity`, and run the activity loader's independent reads together. Verify: one's own profile sends
      no activity request, and `read_activity`'s return is unchanged
- [ ] 3.14 Have the MCP tools call the grouped loaders: `read_profile` and `read_team` through the page loaders and
      the news cache, and `read_topic_feed` with one Findings read. Verify: the MCP contract tests are unchanged,
      and each tool's query count is recorded in design.md
- [ ] 3.15 Add a query budget and a request budget for each page to `apps/api/queryBudgets.test.ts` and the web's
      route tests, over one list of each page's requests in `packages/contracts`, on a fixture with a row in every
      branch and `PODCAST_SPEECH_MODEL` set. (finding R10) Hold each page read's widest stage under a bound too.
      Verify: adding a query or a request to a page fails its test
- [ ] 3.16 Read the same page reads from the mobile app's profile, team, topic, podcast episode, and Topic Post
      screens for its next build. Verify: the client parity check passes, and each screen renders from one read
- [ ] 3.17 Docs: `apps/api/AGENTS.md`, `apps/api/reading-and-chat-routes.md`, `apps/web/AGENTS.md`,
      `apps/mobile/parity.md`, the root routing table. Verify: each page's read is named once

## 4. Bound the reads that grow (item 15, with finding R13)

- [ ] 4.1 Stop the finding count at three: a count over a `limit 3` subquery in `hasEnoughFindingsToList`. Verify:
      the tests that match its text, and `bun run smoke:seo` lists the same topics
- [ ] 4.2 Add the partial index `episodes_published_at_idx` on published rows: build it by hand in production first,
      then the migration in 0119's shape. Verify: a schema test, and an `EXPLAIN` of both newest reads
- [ ] 4.3 (close, design D8) Split the home's ranked podcast episode read into pinned and ranked, and build the
      listener ranking index only if the seeded plan in 4.9 shows the scan and sort matter. Verify: the plan and
      the choice are recorded in design.md
- [ ] 4.4 Read the topic page's newest 50 scans without their summaries, one summary, and the month's cost as a
      sum, with a count and a page route for older scans, and bound the scan to podcast episode map and the
      topic's podcast episode read to the same page. A request that does not ask for pages gets today's whole list.
      Verify: `topics.test.ts`, and a test that a poll's cache miss reads no summary but one
- [ ] 4.5 Page a topic's, a person's, and a team's Topic Posts and the home's newest sections on the server, only if
      the request asks. Verify: route tests for both forms, the MCP tools' tests unchanged, and a stored MCP view
      still shows its whole list
- [ ] 4.6 Generalize `useYourTopicsPages` into one hook for any server-paged card section, load ahead every page a
      visible page button opens, and render the page buttons as links for a server-paged section so a reader
      without JavaScript reaches every card. Verify: a hook test that opening a page sends no request for a page
      already loaded ahead, stories for the home's sections, and the home's html holds a link to each page
- [ ] 4.7 (with finding R13) Read the latest podcast episode per topic and the feed's last succeeded scan per topic
      with a lateral `limit 1` on indexes that exist, and update `apps/api/contractFixtures.ts`, which parses SQL
      text. Verify: the shape tests, both contract tests, and an `EXPLAIN` of each
- [ ] 4.8 Check the nightly Dashboard build's reads of `daily_view_counts` and `daily_play_counts` use their primary
      keys over item and day. Verify: the plans are recorded in design.md
- [ ] 4.9 Seed a Neon branch to launch scale (25,000 users, sized from the plan limits in A.15), never dev, and run
      `EXPLAIN` on every query the home, topic, profile, team, Topic Post, podcast episode, and Specials pages
      send. Add an index for any sequential scan of a table that grows, and add these reads to the plan smoke.
      Verify: each page's plans are kept in `logs/launch-hardening/`, and the smoke fails on a sequential scan
- [ ] 4.10 Docs: `packages/db/AGENTS.md` (the by-hand index build), `apps/api/AGENTS.md`. Verify: the procedure is
      written once and linked from the deployment guide

## 5. The News read (item 16)

- [ ] 5.1 Give each own-group arm a filter on candidate ids read from the indexes inside the window, keeping its one
      select and today's filter. Add smoke checks: a Comment and a reaction on the person's Topic Post on someone
      else's Topic, a reaction on the person's Comment on someone else's Topic, and a row that fits two arms shown
      once. Verify: the news smoke returns the same rows as before on dev
- [ ] 5.2 Skip the window count on a read with a cursor, and take `total` from the cursor. Verify: the response
      contract is unchanged, and a cursor read's statement holds no window count
- [ ] 5.3 Cache a person's own first page for 60 seconds in the route, one key a window, cleared with one delete
      from the writes that create their events (a comment, a reaction, a Topic Post, a follow), and invalidate the
      client's news query on the same writes. Verify: a test that a person's own comment shows on their next read,
      and that another reader's read is never served from that key
- [ ] 5.4 Store a null opener under the opener's own key for 60 seconds, for nothing unread, a spent budget, and a
      failed model. Update the four tests that assert the old rule. Verify: a second home load inside the minute
      sends no unread read, no reservation, and no model call
- [ ] 5.5 Docs: `apps/api/AGENTS.md`. Verify: the news cache and the opener's marker are named

## 6. Status reads for the polls (item 17, with finding R12)

- [ ] 6.1 Add `packages/db` status keys and their deletes for a film, a discussion, and a Scan, and delete the key
      inside each existing status write: the film's rows module, the discussion's module, and the Scan's start,
      pick-up, and closing writes. No workflow changes. Verify: a test for each write that the key is gone
- [ ] 6.2 Add the three status reads after `/api/status/` with their contracts, clients, and registry entries: a
      `cacheJson` load of one row, with a lifetime of 10 seconds for a film, 5 for a discussion, and 2 for a Scan,
      returning the status alone. A public subject's status goes to anyone; any other goes through the page's own
      access check. Verify: route tests for each status, the access check, and a Redis failure falling back to the
      row
- [ ] 6.3 Switch the film poll on the podcast episode page and the topic page, and the discussion poll, to read the
      status and read their page once when it leaves in progress. The page passes the status read in, so an MCP
      view's card keeps working. A failed status stops the poll. Verify: hook tests, and the MCP view's test
- [ ] 6.4 (finding R12) Switch the scan poll to the Scan's status read, reading the topic page when the status or
      its counts change, and cover the unpublished podcast episode's status so a long recording costs a key read.
      Verify: a test that a signed-in viewer's poll sends no topic page read while nothing changes
- [ ] 6.5 Keep every waiting reader's interval, and start a reader who may not scan the topic at 10 seconds. Verify:
      `scanPoll.test.ts` for both readers
- [ ] 6.6 Poll a newer film's status on a topic page that shows an older film with the filming line. Verify: a test
      that the line clears without a reload
- [ ] 6.7 Move the web's linked podcast episode poll and the image render poll onto the limited poll, so both pause
      in a hidden tab and the first gets a limit. Verify: tests for the pause, the resume on focus, and the stop
- [ ] 6.8 Keep the shown topic if the polled payload is unchanged, with `replaceEqualDeep` on the web. Verify: a
      test that an unchanged poll causes no render
- [ ] 6.9 On mobile, pass the film and discussion polls an enabled flag from the screen's focus. Verify: a hook test
      that a covered screen stops the poll
- [ ] 6.10 Send a three-second edge lifetime on a visitor's poll read and on a public status read without
      credentials, behind group 7's rule. Verify: `edgeCache.test.ts`
- [ ] 6.11 Docs: `apps/api/AGENTS.md`, `apps/api/reading-and-chat-routes.md`, `apps/web/AGENTS.md`,
      `apps/mobile/AGENTS.md`. Verify: each names the status reads

## 7. Findings: the edge, documents, and limits

- [ ] 7.1 (finding O7) Move Cloudflare's whole cache rule, its bypass rule, and its zone settings from the archived
      design into the deployment guide, and list each new shared path there as a manual step: `/api/home`, the page
      reads, `/api/status/`. Verify: the guide's rule names every path the origin marks shared
- [ ] 7.2 (finding O7) Write a read-only script, run after a release and named in the runbook, that requests each
      path the origin marks shared twice and fails on `DYNAMIC` or `BYPASS`. Verify: it fails on `/api/home` today
      and passes once the rule is edited
- [ ] 7.3 (finding P1) By hand in Cloudflare: a cache rule ahead of the cookie bypass for the versioned public file
      paths (topic, podcast episode, film, Topic Post, and body images, avatars, team avatars, favicons, podcast
      covers, link previews, and preview cards), with the edge lifetime from the origin's headers. Verify: a public
      image read with a cookie is an edge hit, and a private Topic's image read with its owner's cookie is never
      served to a second account
- [ ] 7.4 (findings S5 and P7) Read the sitemap, llms.txt, and each Topic's feeds through `cacheJson` for ten
      minutes, give llms.txt its own two reads with a limit of 50, keep each card's lookup for a minute, redirect a
      card request whose query is not its current version to the versioned url, and share one deep health result
      for a second. No new limiter. Verify: a second sitemap read sends no query, and a card request with a stray
      query redirects
- [ ] 7.5 (finding P6) Give the search embedding a two-second limit and no retries, returning the text matches when
      it passes, and send a chat turn's headers before its retrieval. Verify: a test with a slow embedding returns
      text matches inside three seconds
- [ ] 7.6 (finding S12) Keep a search query's vector for an hour as base64 of 32-bit floats, and count a signed-in
      user's embeddings as a visitor's are. Verify: a test of the stored size and lifetime
- [ ] 7.7 (finding P8) Count MCP protocol messages (`initialize`, notifications, `tools/list`, `resources/list`,
      `resources/read`) in a bucket of their own with a far higher limit, keep 30 a minute for `tools/call`, and
      give a signed-in user's MCP calls a bucket apart from their chat posts. No tool's contract changes. Verify:
      a test that 30 handshakes do not block a tool call
- [ ] 7.8 (finding O13) Retry an edge purge once on a 429 after its wait, and report a failed purge with a fixed
      message and the tag in its extra. Verify: `edgePurge` tests
- [ ] 7.9 (finding O15) Add the six click ids to the stripped list, and answer a GET under `/assets/` that matches
      no file with a plain 404 ahead of the page guards. Verify: `index.test.ts`
- [ ] 7.10 (found in the `launch-hardening-safety` apply, 2026-11-13) Delete a Topic's cached visitor page when its
      image is replaced or removed, from the api and from the worker. Today a visitor's Topic read names the
      replaced file for up to 30 seconds, and the file route serves a Topic's current image alone, so the old
      file responds 404 at the origin. Check the podcast episode's and the Topic Post's page reads for the same.
      Verify: a test that a visitor's read names the new file right after `replaceTopicImage`
- [ ] 7.11 Docs: `apps/api/AGENTS.md`, `apps/docs/runtime-architecture.md` (what reaches the origin). Verify: each
      names the changed route

## 8. Integration checks

- [ ] 8.1 `bun run check` is green, the contract freeze check against every snapshot and the MCP contract tests
      included
- [ ] 8.2 An `oha` run of a public profile, a public Topic Post with images and a code block, a public podcast
      episode page, and a public Specials page against the local api, before and after. Verify: both outputs are
      kept in `logs/launch-hardening/`
- [ ] 8.3 The MCP smoke with its Dashboard sections. Verify: it passes
- [ ] 8.4 Load each page in a browser as a visitor and signed in, with the network panel open. Verify: one page
      read per page, no counted audio or film route before a press, a view POST after each load, and a status read
      per poll

## Workflow follow-up

- Ship through `/ship` after `launch-hardening` is archived, which archives this change with
  `openspec archive launch-hardening-page-reads --yes`.
- Before the push: build `episodes_published_at_idx` by hand in production.
- After the push: edit Cloudflare's rule for the new paths, run the edge check script, then turn the page reads'
  edge headers on.

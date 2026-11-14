# Proposal

## Why

A wave of page loads multiplies into several times as many requests and queries. A visitor's profile is 3 requests
and 41 queries, a topic page 34, and one cold read can start 20 statements at once against a pool of 15. While a
film renders or a Scan runs, every viewer re-reads a whole page every few seconds, and a signed-in viewer's scan poll
never hits its cache: 200 viewers of one Scan send about 2,000 queries a second. This is Part B of the last work
before launch, the api's page reads. Its sibling changes are `launch-hardening`, `launch-hardening-browser-load`,
and `launch-hardening-safety`.

## What Changes

- **One read per page.** The profile, the topic, the podcast episode, the Topic Post, and the Specials pages each
  get a page read that returns the head with everything the first screen shows, and the server render passes it to
  the browser so hydration fetches nothing again. The routes shipped builds read stay beside them.
- **Cached visitor pages.** Each page read's visitor payload is cached at the origin for 30 to 60 seconds and
  cleared by the writes that change it, a film's swap and a body image's removal among them. A signed-in reader's
  own state arrives in a part that is never cached.
- **Budgets.** A query budget and a request budget for each page, on a fixture with a row in every branch.
- **Reads that stop growing.** The finding count stops at three, the latest podcast episode and the feed's last scan
  are read one row a topic, the scan history and the Topic Post lists page on the server if the request asks, and
  the home's newest sections load a page at a time with the next loaded ahead.
- **A cheaper News read**, cached for the person who wrote it, with a stored marker for a day that has no opener.
- **Status reads for the polls.** A film's, a discussion's, and a Scan's status each become a key read, the page is
  read once when the status changes, and the person waiting keeps today's interval.
- **Rate limits after the split.** The rule that lets a page render's own reads through is kept and tested from the
  private network, and the client address is read more strictly behind Cloudflare.
- **The edge.** Cloudflare's rule is recorded in the guide, each new shared path is a manual step with a check
  that fails if the edge is not caching it, and a topic made private leaves the edge at once.

No route, field, or MCP tool return that a released build reads is removed or changed.

## Capabilities

### New Capabilities

- `page-reads`: one read per page with its head and first screen, passed from the server render to the browser,
  with the reader's own state kept out of the shared payload and a query and request budget for each page.
- `status-reads`: a small read of a film's, a discussion's, or a Scan's status that a poll uses in place of a page.

### Modified Capabilities

- `request-capacity`, `edge-caching`, `performance-telemetry`: the render's rate limit rule, the client address,
  the visitor caches and what clears them, the per-topic tag, the recorded edge rule, and the budgets.
- `public-profiles`, `teams`, `home-page`, `topic-detail-page`, `podcast-episode-pages`, `topic-posts`,
  `specials-dashboards`, `ui-routing`: each page's one read, its cache, and its server paging.
- `feed-api`, `scan-history`, `topic-podcast-episode-video-featuring`: bounded reads and lists paged by request.
- `news`, `updates`: the own group's candidate ids, the count on a cursor read, the person's cached first page, and
  the null opener's marker.
- `topic-podcast-episode-video-player`, `topic-post-discussions`, `podcast-episode-player`: polls that read a
  status, pause in a hidden tab, and stop on a closed-out row.
- `site-search`, `podcast-episode-search`, `topic-chat`, `mcp-server`: the bounded search embedding, a chat turn's
  headers before retrieval, and protocol messages counted apart from tool calls.
- `seo`, `social-sharing`, `static-serving`: cached documents, a cached card lookup, and a plain 404 for a missing
  asset.

## Impact

- `apps/api`: five new page routes and three status routes, `profiles.ts`, `profileCards.ts`, `team/teamPage.ts`,
  `home/`, `topic/topics.ts`, `topic/feedData.ts`, `podcast/`, `topicPost/`, `dashboard/`, `news/`,
  `topic/updatesOpener.ts`, `share/pageHead.ts` (the head routes go), `rateLimit.ts`, `trustedProxies.ts`,
  `edgeCache.ts`, `documents.ts`, `seo.ts`, `queryBudgets.test.ts`.
- `packages/db`: a visitor page cache module, a status key module, `index.ts` (the finding count), one index on
  `episodes`.
- `packages/pipeline` and `apps/worker`: cache and status clears inside existing status writes.
- `packages/contracts`, `packages/client`, `packages/core`: the page read contracts and clients, the status reads,
  a server-paged card section hook, the poll helpers.
- `apps/web`: the route loaders, the pages, the polls. `apps/mobile`: the same page reads and the polls' focus flag
  in its next build.
- `apps/docs/deployment.md` (Cloudflare's rule), a new edge check script, `apps/api/AGENTS.md`,
  `apps/api/reading-and-chat-routes.md`, `apps/web/AGENTS.md`.
- By hand: Cloudflare's cache rule for each new shared path and for the public file paths.

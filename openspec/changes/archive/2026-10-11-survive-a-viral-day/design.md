## Context

The benchmark behind this change measured the api on Bun with the database and Redis stubbed: a homepage render at about
60 a second and 20 milliseconds of CPU, a topic page at about 90, the signed-in shell at over 900, and p99 latency past
a second at fifty concurrent renders, with nothing turning a render away. The scan queue had 16 slots across two worker
replicas, and a scan's 90-minute ingest timeout counted its wait for a slot, so a backlog of first scans past about 240
an hour failed scans that never ran. A Redis command had no deadline, so a wedged connection blocked every request that
touched it. The signup gate cookie passed on its signature alone for fifteen minutes. Bun's default body limit is 128
megabytes, and a 26-megabyte chat body was parsed before the signed-out check. Every visitor built the feed. Nothing
summed spend across users.

Constraints: Bun and Drizzle only, one `package.json`, Neon's connection pooler in transaction mode, a single-node Redis
on a Bun client that is not Sentinel-aware, Temporal self-hosted on one server, and tests that run offline with the pool
and Redis stubbed. The repository's dependency changes run through the pinned Bun so the lockfile keeps the format CI
reads.

## Goals / Non-Goals

**Goals:**

- A spike degrades to stale pages and short retries, never to a wedged process or an empty pool.
- A visitor costs the origin one render per cache window, not one per click.
- A scan backlog waits, and a waiting scan never fails for having waited.
- Spend is visible per day and bounded per user before it is bounded by the vendor's balance.
- Every failure path responds with a status its caller can act on.
- Advisories, action drift, and image drift are caught by the repository, not by an incident.

**Non-Goals:**

- A proxy-wide LiteLLM limit value, which needs a month of measured spend.
- A daily spend kill switch, a monthly backstop on scans, or per-key parallel limits, which need the owner's decision on
  what a paying user is told.
- Graceful shutdown on SIGTERM, 404 edge caching, an etag middleware, a head-first topic route, a Gemini quota-aware
  deferral, a Reddit queue, server-side avatar re-encoding, and parallel sweep dispatch.
- The dashboard settings only the owner can change: autoscaling, replica counts, the Neon compute range, the Cloudflare
  rules, the Sentry alert rules, the vendor limits, and the GitHub security toggles.

## Decisions

### Render admission counts renders, not requests

The api counts the visitor renders in flight per replica and sheds one past `RENDER_CONCURRENCY` with a 503 and
`Retry-After: 2`, sent `private, no-cache` so the edge keeps serving its stale copy. A signed-in render is neither
counted nor shed, since it is the cheap shell. A render counts until the ui's server returns the page's headers: the
route loaders and the shell, which are most of a render's work, and not the streamed remainder, since holding the count
until a body ends would leak a count for every stream neither read to its end nor cancelled. Why a counter and not a
queue: a queued render still holds its connection and its memory, and the edge's stale copy is the better response for a
visitor. Why 16: the benchmark's p99 stayed under 400 milliseconds at ten concurrent renders and passed a second at
fifty, so the limit sits a little above the ten that stayed fast.

### The page guards run ahead of every page the origin renders

A page `GET` passes three guards, mounted once ahead of the blog and release routes and once ahead of the ui's render:
`renderedCacheHeaders`, the page render limiter, and the click id redirect. So the 429, the click id 301, the slash 301,
and the shed 503 all leave with the page routes' cache headers, a visitor's redirect shared at the edge and every other
response private. The limiter is keyed by the address `trustedProxies.ts` resolves, and counts page renders only: the
feed and the topic page, the api reads a visitor's page makes most, are served from the visitors' shared copies, and the
search routes have their own limit. A request with a session cookie skips it, since a signed-in render is the cheap
shell, and the signed-in routes that cost more already have the tool caller limit. A request with no trusted address, or
with an internal one, skips it, since counting it would put every such visitor in one bucket. The limit, 120 a minute,
is far above a real page load's handful of origin requests, and only a scraper or a client busting the cache with a
fresh query string per request reaches it. The search limit is its own rate limit window at 60, keyed like the tool
callers'.

### The body limit is the default, and the large routes opt out by path

`api.ts` mounts a one-megabyte limit under `except` for the chat, upload, and note sync paths, which keep their own
limits; the note sync's is one update at its largest plus its JSON, built with the same `toBodyLimit` as the default. A
signed-out chat post is rejected by `toSignedOutRejection` ahead of the chat limit, so a visitor's request never holds
26 megabytes, and a chat room post responds 404 there, as a missing room does. An upload route rejects a visitor the
same way before its own limit. Bun's `maxRequestBodySize` is 32 megabytes, above the largest route limit, so a body past
it is cut off before any route runs. Why a default and not a per-route limit: a new route would otherwise ship
unbounded.

### Visitors share one copy, keyed by what varies

The visitors' feed is one Redis key per view for 30 seconds, and the visitors' topic page, its Similar topics included,
one key per topic for 30 seconds. The edge already shares these for a minute per location; the copies serve each
location's misses, and the requests that reach the origin without the edge, with one build. Every edit and delete of a
topic and every Source added or removed calls `clearVisitorTopicCaches`, which drops the topic's page copy, and every
team attach or detach calls `clearVisitorTopicPages`. The editor save, `updateTopicFields`, `updateTopicPrompt`, and the
delete also drop the feed copies with the featured and popular topic id lists if the topic was or is public or a feature
order was released, and the featuring changes clear the feed copies too. Two windows stay open, each inside the minute
the edge already serves a page: a read that was loading when the save returned may write its copy once more, for 30
seconds, and another topic's page copy may list a topic that just went private among its Similar topics until its 30
seconds end. Closing them would need a per-topic version on every copy, which a window no longer than the edge's own
minute does not justify. The copies have no single-flight, so each request that misses builds; render admission bounds
how many do on one replica. The poll reload keeps its own two-second key, so a visitor watching a first scan sees
progress.

### A Redis command has a deadline, and the client is replaced after three

`runWithRedis` races each command against two seconds. A missed deadline counts as an error and returns null, as a
failed command does. Three missed in a row replace the client through the store's own reconnect, since Bun's client
keeps a wedged socket open. The minute line reads `INFO memory` and crosses `redis-memory` at eight tenths of the limit
and `redis-errors` at ten errors with the client connected, each warning once an hour like the others.

### The queue wait is its own timeout, and the closing writes have their own queue

Every stage that waits for a shared slot, a Scan's ingest and review and a Source's screen, has a schedule-to-close of
`QUEUED_STAGE_TIMEOUT_MS`, a day, while its start-to-close still bounds each attempt: 30 minutes for an ingest or a
review attempt and two for a screen. A review queues behind every first scan's ingest, so a review bounded by its
running total alone would fail a Scan that already paid for its ingest. The stale sweep follows: a dispatched Scan
nobody picked up is closed after the day, and a picked-up Scan after both stages' days and the closing writes, since a
picked-up Scan may legally wait that long for its review. `finishScan`, `failScan`, `stopScan`, and the two not-started
reports run on the `scan-closing` queue with an activities-only Worker of eight slots that registers every scan
activity, so a full scan queue never starves a scan's finish. A sweep starts at most `SCAN_DISPATCH_LIMIT` minus the
queue's backlog, and a Topic left undispatched stays due; the start of the rows a dying caller never dispatched is
outside that count. A scan that was dispatched and never picked up is left out of the window subquery, so its Topic
stays due. A manual start that throws responds 503 and is reported, and the row it opened is deleted, so the owner can
start it again. A start that hit the client's deadline may have started the workflow, so its row is kept.

### A transient screen failure keeps the Source pending

The screen activity runs up to three attempts, and a fetch that timed out, had its connection dropped or turned away, or
drew a 429 or 5xx throws a retryable failure. The llm-guard call inside a Source screen waits up to 20 seconds, since
nobody waits on it and a long page should screen instead of timing out. If the attempts run out, the workflow returns
with the Source still pending, and the next sweep, which starts a screen for every pending Source, screens it again. A
Source still failing transiently a day after its save fails with the reason, so a url that always responds 429 is not
fetched on every sweep forever and its owner is told. A flagged page still fails the Source. Why not fail at once: an
unfetchable url is a rejection the owner is told once, and a 429 from a crawler proxy during a burst is not that.

### The daily spend gauge sums what the app already records

`dailySpend.ts` sums the day's `scans.cost`, `chat_turns.cost`, and the podcast `episodes.cost` and counts the day's
signups, logs them from the sweep, and crosses `daily-spend` past `GLOBAL_DAILY_SPEND_ALERT_USD`. Why a gauge and not a
limit: a limit decides what a paying user is told, which is the owner's call, and the gauge is what that call needs.

### A repeated error is reported ten times an hour

`reportError` sends one stage's one error ten times an hour, skips the rest, and sends the skipped count with the next
hour's first report, in a map bounded at a thousand keys. The decision is a pure function over the map, tested as such.
Sentry groups identical errors anyway; the hourly limit protects the quota during an incident that repeats one error
thousands of times.

### The statement timeout is the role's default

The migrate job sets `statement_timeout = '30s'` on the role after migrating, since a per-session `SET` does not survive
Neon's transaction-mode connection pooler and the role's default is what every pooled server connection takes. A
migration that needs longer puts `SET LOCAL statement_timeout = 0` first in its SQL. The claim's transaction opts out of
the idle-in-transaction timeout, since it sits idle while the task runs.

### The supply chain is checked by the repository

Dependabot covers the Bun lockfile, the actions, and the Docker bases; `bun audit` runs report-only on every CI run so
an advisory is visible without blocking an unrelated push; CodeQL runs on every push to main, every pull request into
main, and weekly; every action is pinned to the commit its major tag pointed at, with the version beside it for
Dependabot; every image base has its digest; and `minimumReleaseAge` holds a new version three days. The advisories left
after the update sit in dev tooling and in transitive packages waiting on upstream releases, which Dependabot will bring
in. `@react-email/ui`, the email preview server `email dev` loads, moves to the development dependencies at exactly the
`react-email` version the CLI demands, so the production image no longer installs its Next.js. `better-auth` moves to a
patch-only range, since its next minor brings a zod the MCP SDK's types reject. The LLM Guard image moves to 0.3.16 to
match the compose file.

## Risks / Trade-offs

- A visitor shed with a 503 sees a short message instead of a page if the edge has no copy yet. The retry is two
  seconds, and a page the edge never had is one nobody has shared.
- A visitor's feed and topic page are up to 30 seconds stale beyond the edge's minute, and a topic that went private is
  readable for that window, as it already was at the edge.
- The page render limit can reject a visitor behind a large shared address, such as a campus, at more than two requests
  a second sustained. The 429 names the minute to wait.
- The statement timeout cancels a legitimate long query, which no app query is today; the sitemap and the feeds are the
  ones to watch in the logs after deploy.
- The suggestion limit of 30 tells a user who clicks Recommend more than that in a day to wait for tomorrow.
- The mail hooks respond before Resend accepts the mail, so a send that fails is reported instead of shown.
- Dependabot resolves with its own Bun; a pull request whose lockfile CI cannot read is the sign to bump the Bun pin.
- A Scan whose workflow the server lost after pickup reads as running for up to two days before the sweep closes it out,
  where it was under three hours, since a healthy Scan may now wait a day for its review. Temporal retries an activity
  whose worker died, so only a lost workflow reaches the window.
- Any cookie named like a session cookie skips the page render limit and the shedding and makes its response private, so
  a scraper that sends one is not limited here. The edge still serves its copies, and the tool caller limit covers the
  api routes such a request reaches.
- The LLM Guard image moves to 0.3.16, so the scanner's measured rates are re-measured after deploy, as the image's own
  update process says.
- `stale-if-error` lets the edge serve a page up to two minutes old while the origin fails, which only helps if the
  Cloudflare plan honours the directive; the owner confirms it after deploy.
- `/mcp/register` allows 600 registrations an hour per address, since a hosted AI app registers every user's connector
  from its own address. One address can still write that many rows an hour.
- A request with no known address, or an internal one, skips the page render limit, so a missed proxy hop, which gives
  every visitor the proxy's internal address, leaves visitors unlimited at the origin. `checkTrustedProxies` logs a
  warning for a missed hop once per process.

## Migration Plan

Deploy the migration, then the services. The migration builds two indexes inside its transaction, so writes to
`findings` and `resources` wait for the seconds the build takes at today's size; a larger table would need the indexes
built `CONCURRENTLY` by hand first. The new settings have defaults, so nothing in Doppler has to change for the deploy;
`GLOBAL_DAILY_SPEND_ALERT_USD` is set once a day's spend is known. The closing Worker polls a new queue the moment the
worker replicas restart, and a scan in flight finishes on whichever Worker picked its activities up. The signup gate's
shorter cookie takes effect for the next signup. No rollback step: every change is backward compatible with the rows it
reads.

## Open Questions

- The proxy-wide LiteLLM limit value, the daily kill switch, and the monthly scan backstop wait on the owner's decision
  about what a paying user is told when the app, not their plan, stops them.

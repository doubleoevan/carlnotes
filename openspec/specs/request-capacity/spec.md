# request-capacity Specification

## Purpose
TBD - created by archiving change add-request-path-headroom. Update Purpose after archive.
## Requirements
### Requirement: The connection pool fits a request's concurrency and fails loudly when full

Each long-running process SHALL size its connection pool from the database at startup: it reads `SHOW max_connections`
and sets the pool's size to 0.9 times that value, the share Neon's connection pooler holds on its server side for one
user and database, divided by the pool count, the number of processes that can hold a pool at once. The pool count is a
constant in `db/index.ts`, 8 by default, counting two api replicas, two worker replicas, the sweep, the budget reset,
and two more for the replicas a rolling deploy overlaps with and the release jobs. `DATABASE_POOL_COUNT` SHALL override
the pool count, and `DATABASE_POOL_MAX` SHALL override the computed size itself. The processes that size their pool are
the api, the Temporal worker, the sweep, and the budget reset. A short-lived job such as the migration or the docs embed
keeps the default. Until the read completes, and if the read fails, the pool SHALL hold the default of 15, the size a
0.25 CU compute allows, and a failed read SHALL be reported to Sentry. A process with no `DATABASE_URL`, such as a test,
SHALL keep the default and read nothing. Each process SHALL log the size it computed, the `max_connections` it read, and
the pool count. A request that finds no free connection SHALL wait at most the connection
timeout that `DATABASE_CONNECT_TIMEOUT_MS` sets, with a default of 10 seconds, and then fail with an error instead of
waiting forever. An error a route does not handle SHALL be reported to Sentry, and the route SHALL respond 500 as it
does today. Every process reaches Postgres through the connection pooler alone, holding no connection outside it. A
computed size below what one request sends at once, which a 0.25 CU compute gives, queues that request's queries inside
its own pool and fails nothing.

#### Scenario: A signed-in feed request gets its connections

- **WHEN** one signed-in feed request sends its queries on an otherwise idle process
- **THEN** no query waits for a connection, and the pool's waiting count stays at zero

#### Scenario: Two feed requests at once do not queue

- **WHEN** two signed-in feed requests arrive at once on an otherwise idle process
- **THEN** no query waits for a connection

#### Scenario: A burst of feed requests queues and drains

- **WHEN** 50 feed requests arrive at once on the dev api
- **THEN** every request succeeds well inside the connection timeout, and the pool's waiting count returns to zero once
  they finish

#### Scenario: A request past the timeout fails visibly

- **WHEN** every connection stays taken past the connection timeout
- **THEN** the waiting request fails with a 500, and its error reaches Sentry as an issue

#### Scenario: Replicas fit the compute

- **WHEN** a process starts against a database whose `max_connections` is 901 with the default pool count of 8
- **THEN** its pool holds at most 101 connections, and eight such pools hold 808, inside the connection pooler's 810

#### Scenario: The size is computed from the read

- **WHEN** the read returns `max_connections` 209 and the pool count is 8
- **THEN** the pool's size is 23, and the startup line names 23, 209, and 8

#### Scenario: The override wins

- **WHEN** `DATABASE_POOL_MAX` is set to 30 and the read returns 901
- **THEN** the pool's size is 30

#### Scenario: A failed read keeps the default and reports

- **WHEN** the read throws at startup
- **THEN** the pool's size stays 15, and the failure reaches Sentry

### Requirement: A read by topic or by scan uses an index

The `sources` and `attachments` tables SHALL be indexed by `topic_id`, and `findings` SHALL be indexed by `topic_id`
with `relevance_score` descending, by `topic_id` with `created_at`, and by `scan_id`, so the feed build, the topic page,
the new count, and a scan's findings read by index instead of scanning their tables. `resources` SHALL be indexed by
`content_hash`, so the duplicate check review runs on every fetched page reads by index.

#### Scenario: The feed build reads by index

- **WHEN** the feed build reads its topics' sources, attachments, and ranked findings
- **THEN** each read can use an index scan, as `explain` shows with sequential scans disabled

#### Scenario: A scan's findings read by index

- **WHEN** a public topic page's structured data or a scan email reads one scan's findings
- **THEN** the read can use the `scan_id` index

#### Scenario: The duplicate check reads by index

- **WHEN** review checks whether a fetched page's content hash is already stored
- **THEN** the read can use the `content_hash` index

### Requirement: A topic's finding read is bounded far above any real topic

A read of one topic's findings SHALL return at most 1,000 findings, most relevant first. The limit sits far above what review keeps for any topic, at most 20 findings besides the ones its users bookmarked or rated, so every topic under it reads whole. A topic past the limit loses its least relevant findings from the read, bookmarked and rated ones included, so a read that reaches the limit SHALL send a Sentry warning for the limit to be raised.

#### Scenario: A topic under the limit reads whole

- **WHEN** a topic with fewer findings than the limit is read, counting every finding review kept and every finding its users bookmarked or rated
- **THEN** the read returns all of them, and a comparison of every production topic's finding count before and after the limit shows no topic with fewer

#### Scenario: A topic past the limit is stopped and reported

- **WHEN** a topic has more findings than the limit
- **THEN** the read returns the limit's worth, most relevant first, and a warning reaches Sentry

### Requirement: A request reads its user's access and each topic role once

Within one request, the user's access row, their role, plan, and budget override, SHALL be read at most once, and their role on a given topic at most once, however many permission checks the request makes. A request that sends a write statement SHALL read both again afterwards. Code outside a request, such as the worker, SHALL read the database directly, and the billing paths SHALL keep reading the user row with their own query. The one exception is the scheduled sweep, which SHALL read each owner's remaining daily scan quota once per sweep and lower its own copy by one for each Scan it starts, since the sweep writes constantly and a request memo would clear on every write.

#### Scenario: A topic page reads the access row once

- **WHEN** a signed-in user opens a topic page whose permission checks each ask for their access
- **THEN** the request sends one read of the user's access row

#### Scenario: A write is followed by a fresh read

- **WHEN** a request reads a user's access, sends a write statement, and reads the access again
- **THEN** the second read goes to the database

#### Scenario: The worker reads directly

- **WHEN** a worker activity checks a user's scan quota
- **THEN** the access row is read from the database, with no memo

#### Scenario: The sweep reads an owner's quota once

- **WHEN** the sweep reaches ten due Topics of one owner
- **THEN** it reads that owner's remaining scan quota once, starts as many as remain, and skips the rest as over quota without another read

### Requirement: Content files are read without blocking the event loop

The blog and docs Markdown files SHALL be read asynchronously, and their parsed pages kept in memory for at most 60 seconds, so no request to `/blog`, `/llms.txt`, `/llms-full.txt`, `/feed.xml`, or `/sitemap.xml` blocks the event loop on the filesystem. A page still ships by adding its file, and a new file SHALL appear within the 60 seconds.

#### Scenario: A crawler reading llms-full stalls nothing

- **WHEN** a client fetches `/llms-full.txt` in a loop
- **THEN** the event loop delay the minute line reports stays at its idle level

#### Scenario: A new post appears

- **WHEN** a Markdown file is added to `content/blog/` on the dev server
- **THEN** `/blog` lists it within 60 seconds, with no restart

### Requirement: A name search uses a trigram index

`pg_trgm` SHALL be enabled, and `users.username_normalized`, `lower(teams.name)`, and `lower(topics.name)` SHALL each
have a trigram GIN index that matches the expression the search uses, so a username, a team name, and a topic name
search read by index instead of scanning their tables. A query shorter than three characters holds no trigram and still
scans, which the two-character minimum allows.

#### Scenario: A username search reads by index

- **WHEN** a username search runs with three or more characters
- **THEN** `explain` shows a bitmap scan on the trigram index with sequential scans disabled

#### Scenario: A topic name search reads by index

- **WHEN** the search bar's topic search runs with three or more characters
- **THEN** `explain` shows a bitmap scan on the trigram index with sequential scans disabled

### Requirement: A visitor's render past the concurrency limit is shed

Each api replica SHALL count the page renders in progress for requests without a session cookie, from the start of the
render until the ui's server returns the page's headers, and a visitor's render that would pass `RENDER_CONCURRENCY`, 16
by default, SHALL get a 503 at once, with `Retry-After: 2` and `Cache-Control: private, no-cache`, so the edge keeps
serving its copy, stale if the origin errs, and caches nothing from the shed response. A render for a request with a
session cookie SHALL be neither counted nor shed. A render SHALL release its count however it ends.

#### Scenario: A burst past the limit is shed

- **WHEN** a seventeenth visitor render arrives while sixteen are in progress on one replica
- **THEN** it gets a 503 with a two-second retry, and the sixteen finish

#### Scenario: A signed-in render is never shed

- **WHEN** a render with a session cookie arrives while the visitor limit is reached
- **THEN** it renders

#### Scenario: Signed-in renders never shed a visitor

- **WHEN** a visitor's render arrives while only signed-in renders are in progress, however many
- **THEN** it renders

#### Scenario: A failed render releases its count

- **WHEN** a render throws
- **THEN** the next visitor render is counted as if the failed one had finished

### Requirement: A visitor's page requests are limited by address

A visitor's `GET` and `HEAD` requests that render a page at the origin, a page the ui's server renders, a blog page, or
a release page, SHALL be limited to 120 a minute per client address, counted in Redis so every replica shares the count.
A request with a session cookie, and a request whose address the trusted proxies resolve to nothing or to an internal
address, SHALL skip the limit. A limited request SHALL get a 429 with `Retry-After: 60` and `Cache-Control: private,
no-cache`. The limit SHALL set no rate limit headers, so a page the edge shares never shows one visitor's count. Static
files SHALL be served before the limit and never count.

#### Scenario: A scraper is limited

- **WHEN** one address requests 121 pages in a minute without a session cookie
- **THEN** the last gets a 429 with a one-minute retry

#### Scenario: A signed-in user is never limited here

- **WHEN** a signed-in user loads many pages in a minute
- **THEN** none is rejected by this limit

### Requirement: The search routes are limited per caller

The search bar's routes, the topic search, the team search, and the user search, SHALL share one limit of 60 requests a
minute per caller, keyed by the signed-in user, else the client address, counted in Redis.

#### Scenario: A search loop is limited

- **WHEN** one caller sends a sixty-first search inside a minute
- **THEN** it gets a 429

### Requirement: Every request body is bounded unless its route sets its own limit

Every `/api` and `/mcp` route SHALL reject a body over one megabyte with a 413 before the route reads it, except the
routes that set their own limit: the chat turn and chat room posts, the transcription post, the avatar and team avatar
uploads, the topic attachment upload, and the note sync updates, whose limit is one update at its largest plus the JSON
around it. A signed-out post to a chat route SHALL be rejected before its body is read, as the topic-chat capability
states, and so SHALL a signed-out upload, with a 401, and a signed-out note sync, with a 404. The server SHALL cut off
any body past 32 megabytes, above the largest route limit, before a route runs.

The transcription route's limit is 4 megabytes, a minute of recorded audio in any container a browser records.

#### Scenario: An oversized body is rejected early

- **WHEN** a request to a route without its own limit sends a body over one megabyte
- **THEN** it gets a 413 and the route never reads it

#### Scenario: An upload keeps its own limit

- **WHEN** a signed-in user uploads a topic attachment over one megabyte and under its route's limit
- **THEN** the default limit does not reject it

#### Scenario: A note sync past its own limit is rejected early

- **WHEN** a note sync post sends a body past one update's largest size
- **THEN** it gets a 413 and the route never reads it

#### Scenario: A recording keeps its own limit
- **WHEN** a 2 megabyte recording is posted to the transcription route
- **THEN** it passes the body limit, and a 5 megabyte one gets a 413

### Requirement: Visitors share one copy of what every visitor sees

The signed-out feed SHALL be served from one Redis copy per view, all or unread, for 30 seconds across every replica, so
a copy is built only by the requests that miss it. A visitor's topic page read SHALL be served from one Redis copy per
Topic for 30 seconds, its Similar topics included. Every edit or delete of a Topic, every Source added to or removed
from it, and every team attach or detach of it SHALL drop its page copy. A save from the topic editor, a Topic Tool
edit, and a delete SHALL also drop the visitors' feed copies with the shared featured and popular topic id lists if the
Topic was or is public or the change released a feature order. A Topic made private SHALL leave those copies once its
save returns, with two limits, each inside the minute the edge already serves the page: a read already loading when the
save returns MAY write its copy once more, for at most the copy's 30 seconds, and another Topic's page copy MAY still
list the Topic among its Similar topics until that copy's 30 seconds end. A featuring change SHALL drop the feed copies
with the featured and popular topic id lists. A poll reload SHALL keep its own two-second copy, and a signed-in user's
topic page SHALL be read fresh. While Redis is unreachable each request SHALL build its own.

#### Scenario: A thousand visitors cost a handful of feed builds

- **WHEN** a thousand visitors load the homepage within half a minute across two replicas
- **THEN** the feed is built only by the requests that found no copy, not once per visitor

#### Scenario: A listing change reaches visitors

- **WHEN** an admin changes a featured Topic's order
- **THEN** the next visitor's feed is built fresh

#### Scenario: A topic made private leaves the visitors' copies

- **GIVEN** a public Topic that no visitor's read is loading
- **WHEN** its owner makes it private
- **THEN** the next request for its page is served from the database, and the next visitor's feed is built fresh

#### Scenario: A read loading during the save writes its copy once more

- **WHEN** a visitor's read of a public Topic's page is loading as its owner makes the Topic private
- **THEN** the copy that read writes is served for at most 30 seconds, and a request after that is served from the
  database

### Requirement: A statement that runs past thirty seconds is cancelled

The app's database role SHALL have a `statement_timeout` of 30 seconds in the app's database alone, set by the migration
job, so a runaway query is cancelled instead of holding a pooled connection, and another database the role reaches keeps
its own setting. The connection pooler's server connections take the setting as they open. A migration that needs longer
SHALL set `statement_timeout` to zero locally in its own transaction. A database claim's transaction, which sits idle
while its task runs, SHALL opt out of any idle-in-transaction timeout for itself.

#### Scenario: A runaway query is cancelled

- **WHEN** a query runs for more than 30 seconds
- **THEN** Postgres cancels it and its connection returns to the pool

### Requirement: The speech route is limited per caller and per user in progress
`POST /api/chat/speech` SHALL have its own limit of 60 requests a minute per caller, keyed by the signed-in user, else
the client address, counted in Redis under its own rate limit window, so a reply's spoken parts never spend the chat
turn's limit. A user SHALL have at most 3 spoken parts in progress in one process, and a spoken part past that SHALL get
a 429 with `{ error: "rate limited" }` before the user's key is loaded or a model is called.

#### Scenario: A long replay is limited on its own
- **WHEN** a user replays replies past 60 spoken parts in a minute
- **THEN** the 61st spoken part gets a 429, and a chat turn still sends

#### Scenario: A fourth spoken part in progress is rejected
- **WHEN** a user already has 3 spoken parts being spoken and posts another
- **THEN** the fourth gets a 429, and no model is called for it

### Requirement: A recording past the process's transcode limit is turned away with a retry
The api process SHALL run at most 4 recording transcodes at once. A transcription post that passes authorization while
4 are running SHALL get a 503 with `Retry-After: 5` before the recording's bytes are copied, and SHALL write no spend
row. A transcode that ends, read or rejected, SHALL give its slot back.

#### Scenario: A burst of recordings is turned away
- **WHEN** a fifth recording arrives while 4 are transcoding
- **THEN** it gets a 503 with `Retry-After: 5`, and ffmpeg is not started for it

#### Scenario: A failed transcode releases its slot
- **WHEN** ffmpeg rejects a recording
- **THEN** the route answers 422, and the next recording can take that slot

### Requirement: The spoken events route is limited per caller
`POST /api/chat/spoken-events` SHALL have its own limit of 30 requests a minute per caller, counted in Redis under the
`rate-limit:spoken-events` prefix, so the events never spend another route's limit.

#### Scenario: An event loop is limited
- **WHEN** a caller posts a 31st spoken event in a minute
- **THEN** it gets a 429, and nothing is counted


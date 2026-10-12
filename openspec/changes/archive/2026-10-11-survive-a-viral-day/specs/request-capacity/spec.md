## ADDED Requirements

### Requirement: A visitor's render past the concurrency limit is shed

Each api replica SHALL count the page renders in flight for requests without a session cookie, from the start of the
render until the ui's server returns the page's headers, and a visitor's render that would pass `RENDER_CONCURRENCY`, 16
by default, SHALL get a 503 at once, with `Retry-After: 2` and `Cache-Control: private, no-cache`, so the edge keeps
serving its copy, stale if the origin errs, and caches nothing from the shed response. A render for a request with a
session cookie SHALL be neither counted nor shed. A render SHALL release its count however it ends.

#### Scenario: A burst past the limit is shed

- **WHEN** a seventeenth visitor render arrives while sixteen are in flight on one replica
- **THEN** it gets a 503 with a two-second retry, and the sixteen finish

#### Scenario: A signed-in render is never shed

- **WHEN** a render with a session cookie arrives while the visitor limit is reached
- **THEN** it renders

#### Scenario: Signed-in renders never shed a visitor

- **WHEN** a visitor's render arrives while only signed-in renders are in flight, however many
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
routes that set their own limit: the chat turn and chat room posts, the avatar and team avatar uploads, the topic
attachment upload, and the note sync updates, whose limit is one update at its largest plus the JSON around it. A
signed-out post to a chat route SHALL be rejected before its body is read, as the topic-chat capability states, and so
SHALL a signed-out upload, with a 401, and a signed-out note sync, with a 404. The server SHALL cut off any body past 32
megabytes, above the largest route limit, before a route runs.

#### Scenario: An oversized body is rejected early

- **WHEN** a request to a route without its own limit sends a body over one megabyte
- **THEN** it gets a 413 and the route never reads it

#### Scenario: An upload keeps its own limit

- **WHEN** a signed-in user uploads a topic attachment over one megabyte and under its route's limit
- **THEN** the default limit does not reject it

#### Scenario: A note sync past its own limit is rejected early

- **WHEN** a note sync post sends a body past one update's largest size
- **THEN** it gets a 413 and the route never reads it

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

## MODIFIED Requirements

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

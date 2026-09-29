# request-capacity Specification

## Purpose
TBD - created by archiving change add-request-path-headroom. Update Purpose after archive.
## Requirements
### Requirement: The connection pool fits a request's concurrency and fails loudly when full

Each process's connection pool SHALL allow well more connections than one request sends at once, with a size that configuration sets through `DATABASE_POOL_MAX` and a default of 40. A request that finds no free connection SHALL wait at most the connection timeout that `DATABASE_CONNECT_TIMEOUT_MS` sets, with a default of 10 seconds, and then fail with an error instead of waiting forever. An error a route does not handle SHALL be reported to Sentry, and the route SHALL respond 500 as it does today.

#### Scenario: A signed-in feed request gets its connections

- **WHEN** one signed-in feed request sends its queries on an otherwise idle process
- **THEN** no query waits for a connection, and the pool's waiting count stays at zero

#### Scenario: Two feed requests at once do not queue

- **WHEN** two signed-in feed requests arrive at once on an otherwise idle process
- **THEN** no query waits for a connection

#### Scenario: A burst of feed requests queues and drains

- **WHEN** 50 feed requests arrive at once on the dev api
- **THEN** every request succeeds well inside the connection timeout, and the pool's waiting count returns to zero once they finish

#### Scenario: A request past the timeout fails visibly

- **WHEN** every connection stays taken past the connection timeout
- **THEN** the waiting request fails with a 500, and its error reaches Sentry as an issue

### Requirement: A read by topic or by scan uses an index

The `sources` and `attachments` tables SHALL be indexed by `topic_id`, and `findings` SHALL be indexed by `topic_id` with `relevance_score` descending and by `scan_id`, so the feed build, the topic page, and a scan's findings read by index instead of scanning their tables.

#### Scenario: The feed build reads by index

- **WHEN** the feed build reads its topics' sources, attachments, and ranked findings
- **THEN** each read can use an index scan, as `explain` shows with sequential scans disabled

#### Scenario: A scan's findings read by index

- **WHEN** a public topic page's structured data or a scan email reads one scan's findings
- **THEN** the read can use the `scan_id` index

### Requirement: A topic's finding read is bounded far above any real topic

A read of one topic's findings SHALL return at most 1,000 findings, most relevant first. The limit sits far above what review keeps for any topic, at most 20 findings besides the ones its users bookmarked or rated, so every topic under it reads whole. A topic past the limit loses its least relevant findings from the read, bookmarked and rated ones included, so a read that reaches the limit SHALL send a Sentry warning for the limit to be raised.

#### Scenario: A topic under the limit reads whole

- **WHEN** a topic with fewer findings than the limit is read, counting every finding review kept and every finding its users bookmarked or rated
- **THEN** the read returns all of them, and a comparison of every production topic's finding count before and after the limit shows no topic with fewer

#### Scenario: A topic past the limit is stopped and reported

- **WHEN** a topic has more findings than the limit
- **THEN** the read returns the limit's worth, most relevant first, and a warning reaches Sentry

### Requirement: A request reads its user's access and each topic role once

Within one request, the user's access row, their role, plan, and budget override, SHALL be read at most once, and their role on a given topic at most once, however many permission checks the request makes. A request that sends a write statement SHALL read both again afterwards. Code outside a request, such as the worker, SHALL read the database directly, and the billing paths SHALL keep reading the user row with their own query.

#### Scenario: A topic page reads the access row once

- **WHEN** a signed-in user opens a topic page whose permission checks each ask for their access
- **THEN** the request sends one read of the user's access row

#### Scenario: A write is followed by a fresh read

- **WHEN** a request reads a user's access, sends a write statement, and reads the access again
- **THEN** the second read goes to the database

#### Scenario: The worker reads directly

- **WHEN** the worker checks a user's scan quota
- **THEN** the access row is read from the database, with no memo

### Requirement: Content files are read without blocking the event loop

The blog and docs Markdown files SHALL be read asynchronously, and their parsed pages kept in memory for at most 60 seconds, so no request to `/blog`, `/llms.txt`, `/llms-full.txt`, `/feed.xml`, or `/sitemap.xml` blocks the event loop on the filesystem. A page still ships by adding its file, and a new file SHALL appear within the 60 seconds.

#### Scenario: A crawler reading llms-full stalls nothing

- **WHEN** a client fetches `/llms-full.txt` in a loop
- **THEN** the event loop delay the minute line reports stays at its idle level

#### Scenario: A new post appears

- **WHEN** a Markdown file is added to `content/blog/` on the dev server
- **THEN** `/blog` lists it within 60 seconds, with no restart


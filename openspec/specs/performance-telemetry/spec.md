# performance-telemetry Specification

## Purpose
TBD - created by archiving change add-performance-telemetry. Update Purpose after archive.
## Requirements
### Requirement: Every request is a transaction named by its route pattern

With tracing on, each sampled request the api serves SHALL be one Sentry transaction that spans the whole request, with `op` `http.server` and a status from the response's status code. The transaction SHALL be named `<method> <pattern>`, where the pattern is the registered path of the handler that responded, such as `GET /api/topics/:id`, and never the request's url, so percentiles group by route and no id appears in a name. A page the ui's server handler renders SHALL be named by the page's route shape, such as `GET /topics/:id/:slug`, computed by the same rule the visit analytics use to report a page, and a page the ui responds to with a 404 SHALL be named `<method> (not found)`. `/api/health`, `/api/health/deep`, `/assets/*`, `/docs/*`, and the static files at the site root SHALL NOT be traced. Without `SENTRY_DSN`, or outside `prd`, no transaction SHALL be recorded or sent, and every response SHALL be unchanged.

#### Scenario: An api route is named by its pattern

- **WHEN** a request for `/api/topics/5f3c…` is traced
- **THEN** its transaction is named `GET /api/topics/:id`, and requests for any Topic's id group under that one name

#### Scenario: A page render is named by its route shape

- **WHEN** a request for `/topics/5f3c…/agents-weekly` is rendered by the ui's server handler and traced
- **THEN** its transaction is named `GET /topics/:id/:slug`, the shape a page view of the same page reports in PostHog

#### Scenario: A bot's probes share one name

- **WHEN** a bot requests `/wp-admin/install.php` and the ui responds with its missing page
- **THEN** its span is named `GET (not found)`, not by the probe's path, so a scan of a hundred probe paths adds no new transaction name

#### Scenario: A health check is never traced

- **WHEN** the platform polls `/api/health` or a monitor polls `/api/health/deep`
- **THEN** the request is sampled at zero, so no transaction is sent and the polling spends none of the trace quota

#### Scenario: Without a key nothing is traced

- **WHEN** the api runs with no `SENTRY_DSN`
- **THEN** no span is active, each request runs as it did before, and no request goes to Sentry

### Requirement: A slow request shows its stages and its queries

A traced request SHALL include a span for each stage of the feed build and of the topic page load, and a span for every database query it sends. The feed build SHALL have a span for reading its sections, loading the batched feed data, assembling each feed, and reading favicon paths. The topic page load SHALL have a span for the visibility gate and for the page's parallel reads. A query span SHALL have `op` `db`, `db.system` `postgresql`, and the statement Drizzle built as its name, SHALL nest under the stage that sent it, and SHALL NOT include the query's parameter values. A query sent inside a database transaction SHALL have its span too.

#### Scenario: The feed build shows where its time went

- **WHEN** a traced `GET /api/topic-feed` is slow
- **THEN** the transaction shows the feed build's stage spans, and under each stage, the queries that stage sent with their durations

#### Scenario: A query span names its statement and no value

- **WHEN** the topic page load reads a Topic by its id
- **THEN** the query span's name is the statement with its placeholder, such as `where "topics"."id" = $1`, and no attribute or data field includes the id

#### Scenario: A query inside a transaction is covered

- **WHEN** a traced request writes inside a database transaction
- **THEN** each statement in the transaction has its own query span, counted once

### Requirement: Each transaction includes the request's query count and the process's gauges

When a traced request ends, its transaction SHALL include these measurements: `db.query_count`, the number of queries the request sent; `pool.total`, `pool.idle`, and `pool.waiting`, the connection pool's `totalCount`, `idleCount`, and `waitingCount` at that moment; and `event_loop.lag`, the process's p99 event loop delay over the current minute, in milliseconds. A query sent outside any request, such as the worker's, SHALL NOT be counted toward a request.

#### Scenario: Waiting requests show on the slow request

- **WHEN** a traced request finishes while other requests wait for a connection
- **THEN** its transaction's `pool.waiting` is above zero, beside its duration and its `db.query_count`

#### Scenario: Concurrent requests keep their own counts

- **WHEN** two traced requests run at the same time and send different numbers of queries
- **THEN** each transaction's `db.query_count` is the number that request sent, not the total of both

### Requirement: Each long-running process logs its gauges once a minute

The api and the worker SHALL each write one JSON log line a minute with the process's name, the instance it runs as, which is its host's name, the pool's `totalCount`, `idleCount`, and `waitingCount`, and the event loop delay's p99 and largest value over the minute, after which the delay histogram SHALL reset. The instance tells one replica's lines from another's. The worker's line SHALL also include the scan queue's poller count, backlog depth, and the oldest pending task's age. The api's line SHALL also include whether the Redis client is connected and the minute's cache hits, cache misses, and Redis errors, after which those counts reset. The minute timer SHALL NOT keep a process alive, and the scheduled sweep SHALL NOT start one. The log line SHALL be written whether or not any telemetry key is set.

#### Scenario: The worker reports the queue every minute

- **WHEN** the worker has run for five minutes
- **THEN** its log has five gauge lines, each with the instance, the pool counts, the event loop delay, and the scan queue's pollers, depth, and oldest age

#### Scenario: A one-shot sweep exits on its own

- **WHEN** the scheduled sweep runs once as a cron and finishes
- **THEN** the process exits without waiting on a minute timer

#### Scenario: Two api replicas are told apart

- **WHEN** two api replicas each write their minute line
- **THEN** the two lines name different instances, and each has its own pool counts and Redis counts

### Requirement: The scan queue's backlog is read beside its pollers

Describing the scan queue SHALL return its poller count, its activity backlog depth, and the age of its oldest pending activity task, from Temporal's queue stats. When the server returns no stats, the depth SHALL fall back to the queue status's backlog count hint and the age SHALL be reported as unknown, and neither case SHALL fail the caller. The describe call SHALL keep its existing time limit. The scheduled sweep SHALL keep reporting a queue with no poller, and SHALL also report a backlog whose oldest task has waited longer than the backlog age limit.

#### Scenario: A backed-up queue is reported by the sweep

- **WHEN** the sweep runs while the oldest pending scan task has waited 20 minutes
- **THEN** the sweep reports the backlog with its depth and age, and still dispatches its Scans

#### Scenario: An older server still gives a depth

- **WHEN** the Temporal server responds to the describe call without stats
- **THEN** the depth comes from the backlog count hint, the age reads as unknown, and the sweep continues

### Requirement: A crossed threshold alerts through Sentry

If a gauge crosses its threshold, the process that measured it SHALL send one Sentry warning event: a pool with a
waiting request, on the api an event loop that stalled past 2 seconds or whose 99th percentile delay passed 100 ms in
the minute, a scan backlog whose oldest task has waited more than 15 minutes, on the api a minute in which the Redis
client was not connected, a minute with ten or more Redis errors while connected, or a Redis server at eight tenths of
its memory limit, and on the sweep a UTC day whose recorded spend reached `GLOBAL_DAILY_SPEND_ALERT_USD`. The worker's
event loop delay and a shorter api stall SHALL appear only in the minute log. Each condition SHALL group as its own
issue through a fixed fingerprint, SHALL be tagged `alert: performance`, and SHALL be sent at most once an hour per
process, however long it lasts, so a condition every replica measures sends one warning per replica under the one
issue. The event SHALL include the measured values and nothing else. Without `SENTRY_DSN`, the crossing SHALL still
appear in the minute log and nothing SHALL be sent.

#### Scenario: A pool with waiting requests raises one issue

- **WHEN** the pool has a waiting request in three consecutive minutes
- **THEN** one warning event is sent for the first, grouped under the pool condition's issue, and the next two are only
  logged

#### Scenario: Each condition is its own issue

- **WHEN** requests wait for a connection and the event loop lags in the same minute
- **THEN** two warning events are sent, each grouped under its own condition's issue

#### Scenario: Every replica warns once under one issue

- **WHEN** Redis is unreachable to both api replicas for an hour
- **THEN** each replica sends one `redis-down` warning, both grouped under the one issue, and each names its instance

#### Scenario: A day's spend past the alert warns

- **WHEN** `GLOBAL_DAILY_SPEND_ALERT_USD` is 50 and a sweep reads 61 dollars of spend recorded since midnight UTC
- **THEN** one `daily-spend` warning is sent with the day's spend by kind and its signups

#### Scenario: A short api stall only logs

- **WHEN** the api's event loop stalls for 1.3 seconds once in a minute whose 99th percentile delay is 3 ms
- **THEN** the minute log line shows the stall, and no warning is sent

#### Scenario: The worker's event loop only logs

- **WHEN** the worker's event loop stalls for 5 seconds
- **THEN** the minute log line shows the stall, and no event loop warning is sent

### Requirement: Outside production, each request shows its queries and its cache reads

Outside production, which `NODE_ENV=production` marks in the image, the api SHALL count each request's queries and
its Redis cache hits and misses in one request context, whether or not Sentry records the request, and the response
SHALL include a `Server-Timing` header with the duration and the three counts, so curl and a browser's devtools show
them. In dev, the api SHALL also log one line per request naming the method, the route pattern, the status, the
duration in milliseconds, the query count, the cache hit count, the cache miss count, and each key that missed,
and a test run SHALL log no line. Production SHALL keep its Sentry measurements and send neither the line nor the
header. No temporary log file is written.

#### Scenario: A dev request logs its line

- **WHEN** the dev api serves a signed-in request to `GET /api/rooms/mention-count` twice
- **THEN** the first line shows one cache miss naming its key, and the second shows one hit and fewer queries

#### Scenario: The header is present outside production

- **WHEN** a request is served with `NODE_ENV` unset or `test`
- **THEN** its response has a `Server-Timing` header with the duration, the statement count, the hit count, and the miss
  count

#### Scenario: Production sends no header and no line

- **WHEN** a request is served with `NODE_ENV=production`
- **THEN** its response has no `Server-Timing` header, nothing is logged per request, and Sentry still gets
  `db.query_count`

### Requirement: A cached route has a query budget

Each cached route SHALL have a test that requests it twice against a stubbed pool and a fake Redis and asserts the
second request's statement count stays at or under the route's budget: `GET /api/rooms/mention-count` and `GET
/api/topics/:id?poll=1`, which read through the Redis cache, `GET /api/topic-feed` for a visitor, whose section order
reads through the Redis cache, and `GET /api/topics/:id`, whose user access and topic role read once through the request
memo. A change that bypasses a cached read SHALL fail its route's budget test.

#### Scenario: A warm request stays inside its budget

- **WHEN** a budget test requests its route twice
- **THEN** the second request's statement count is at or under the budget

#### Scenario: A bypassed cache fails the budget

- **WHEN** a cached read's key is changed so the second request misses
- **THEN** the route's budget test fails on the second request's statement count


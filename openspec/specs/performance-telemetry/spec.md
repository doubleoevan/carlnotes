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

The api, the web service, and the worker SHALL each write one JSON log line a minute with the process's name, the
instance it runs as, which is its host's name, the process's own resident memory in megabytes, the pool's `totalCount`,
`idleCount`, and `waitingCount`, and the event loop delay's p99 and largest value over the minute, after which the delay
histogram SHALL reset. The instance tells one replica's lines from another's. The web service's line SHALL name the
process `web`, and a worker started in a queue group SHALL name that queue group in its line, so a film replica's lines
are told apart from a main worker's. The worker's line SHALL also include the scan queue's poller count, backlog depth,
and the oldest pending task's age, and the same three numbers for the scheduled scan queue `topic-scans-scheduled`, the
scheduled chapter queue `episode-scheduled-chapters`, the encode queue `episode-encodes`, the topic memory queue
`topic-memories`, the film queue `episode-videos`, and the queue of the films' short writes, `episode-video-writes`. A
worker in a queue group SHALL include only the queues that its queue group's work waits on: a main worker the scan,
scheduled scan, scheduled chapter, encode, and topic memory queues, and a film replica the film queue and the short
writes' queue, which a main worker polls. A worker that renders films SHALL also include how many films are left to
render. The api's and the web service's lines SHALL also include whether the Redis client is connected and the minute's
cache hits, cache misses, and Redis errors, after which those counts reset, the page renders the minute started and the
renders it shed, after which those counts reset too, and how many podcast cover draws wait in the process's cover chain.
The minute timer SHALL NOT keep a process alive, and the scheduled sweep SHALL NOT start one. The log line SHALL be
written whether or not any telemetry key is set.

#### Scenario: The worker reports the queue every minute

- **WHEN** the worker has run for five minutes
- **THEN** its log has five gauge lines, each with the instance, the pool counts, the event loop delay, and the scan
  queue's pollers, depth, and oldest age

#### Scenario: A one-shot sweep exits on its own

- **WHEN** the scheduled sweep runs once as a cron and finishes
- **THEN** the process exits without waiting on a minute timer

#### Scenario: Two api replicas are told apart

- **WHEN** two api replicas each write their minute line
- **THEN** the two lines name different instances, and each has its own pool counts and Redis counts

#### Scenario: The web service names itself

- **WHEN** the web service writes its minute line
- **THEN** the line's process name is `web`, apart from the api's, with its own pool counts, Redis counts, render and
  shed counts, and cover chain length

#### Scenario: A film replica reports the film queue

- **WHEN** a worker in the `films` queue group writes its minute line
- **THEN** the line names the queue group and has the pollers, depth, and oldest age of the film queue and of the short
  writes' queue, the films left to render, and no scan queue's numbers

#### Scenario: A main worker reports its queues

- **WHEN** a worker in the `main` queue group writes its minute line
- **THEN** the line names the queue group and has the pollers, depth, and oldest age of the scan queue, the scheduled
  scan queue, the scheduled chapter queue, and the topic memory queue

#### Scenario: Waiting cover draws show in the line

- **WHEN** podcast cover draws queue up on one replica
- **THEN** that replica's next minute line reports how many wait in its cover chain

### Requirement: The scan queue's backlog is read beside its pollers

Describing the scan queue SHALL return its poller count, its activity backlog depth, and the age of its oldest pending
activity task, from Temporal's queue stats. The scheduled scan queue, the scheduled chapter queue, the topic memory
queue, the film queue, and the films' short writes' queue SHALL be described the same way. When the server returns no
stats, the depth SHALL fall back to the queue status's backlog count hint and the age SHALL be reported as unknown, and
neither case SHALL fail the caller. The describe call SHALL keep its existing time limit. A describe call that fails
SHALL NOT fail the caller either: the sweep SHALL report the failed read, at most once an hour across runs as the
monitoring-analytics capability states for a report from the sweep, and SHALL go on to its next stage. The scheduled
sweep SHALL keep reporting a queue with no poller, and SHALL also report a backlog whose oldest task has waited longer
than the backlog age limit. The sweep SHALL report a film queue that no Worker polls too, unless films are off.

#### Scenario: A backed-up queue is reported by the sweep

- **WHEN** the sweep runs while the oldest pending scan task has waited 20 minutes
- **THEN** the sweep reports the backlog with its depth and age, and still dispatches its Scans

#### Scenario: A film queue with no film replica is reported

- **GIVEN** films are on and no film replica runs
- **WHEN** the sweep runs
- **THEN** the sweep reports that no Worker polls the film queue, in the film stage

#### Scenario: An older server still gives a depth

- **WHEN** the Temporal server responds to the describe call without stats
- **THEN** the depth comes from the backlog count hint, the age reads as unknown, and the sweep continues

#### Scenario: A server the sweep cannot read is reported

- **WHEN** the describe call fails on every sweep for an hour because the Temporal server is unreachable
- **THEN** one report of the failed read is sent in that hour, and each sweep still runs its later stages

### Requirement: A crossed threshold alerts through Sentry

If a gauge crosses its threshold, the process that measured it SHALL send one Sentry warning event: a pool with a
waiting request, on the api and the web service an event loop that stalled past 2 seconds or whose 99th percentile delay
passed 100 ms in the minute, a scan backlog whose oldest task has waited more than 15 minutes, a scheduled chapter or a
film that has waited more than an hour for a slot, a topic memory update, a podcast episode's encode, or a film's short
write that has waited more than 15 minutes, on the api and the web service a minute in which the Redis client was not
connected, a minute with ten or more Redis errors while connected, or a Redis server at eight tenths of its memory
limit, or a minute in which the replica shed a visitor's page render, on any process one stage's error that reached the
hourly report limit, which is the `error-loop` condition the monitoring-analytics capability states, and on the sweep a
UTC day whose recorded spend reached `GLOBAL_DAILY_SPEND_ALERT_USD` or a Firecrawl credit that a review found spent
since the sweep before. The worker's event loop delay and a shorter api stall SHALL appear only in the minute log. Each
condition SHALL group as its own issue through a fixed fingerprint, SHALL be tagged `alert: performance`, and SHALL be
sent at most once an hour per process, however long it lasts, so a condition every replica measures sends one warning
per replica under the one issue. The sweep is a new process on every run, so a warning from the sweep SHALL first take a
one-hour slot in Redis for its condition. It SHALL be sent only if it takes the slot or if Redis cannot say. The event
SHALL include the measured values, the stage for `error-loop`, and nothing else. Without `SENTRY_DSN`, the crossing
SHALL still appear in the minute log and nothing SHALL be sent.

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

#### Scenario: A film that waited an hour warns

- **WHEN** a film replica's minute line reads a film queue whose oldest render has waited 61 minutes for a slot
- **THEN** that replica sends one `topic-video-backlog` warning with the queue's pollers, depth, and oldest age

#### Scenario: A film's short write with no main worker warns

- **WHEN** a film's row write has waited 16 minutes on the short writes' queue
- **THEN** each film replica sends one `topic-video-write-backlog` warning

#### Scenario: A short api stall only logs

- **WHEN** the api's event loop stalls for 1.3 seconds once in a minute whose 99th percentile delay is 3 ms
- **THEN** the minute log line shows the stall, and no warning is sent

#### Scenario: The worker's event loop only logs

- **WHEN** the worker's event loop stalls for 5 seconds
- **THEN** the minute log line shows the stall, and no event loop warning is sent

#### Scenario: A web service stall warns

- **WHEN** the web service's 99th percentile event loop delay passes 100 ms in a minute
- **THEN** that replica sends one event loop warning, grouped under the same issue as the api's

#### Scenario: A sweep's warning is sent once an hour across runs

- **WHEN** sixty sweeps in one hour each read a day's spend past the alert
- **THEN** the sweep that takes the hour's slot sends the one `daily-spend` warning, and the other fifty-nine send
  none

#### Scenario: Redis down does not silence the sweep

- **WHEN** a sweep crosses a threshold while Redis is unreachable
- **THEN** the sweep sends the warning

#### Scenario: A looping error warns once

- **WHEN** one stage reports the same error for the tenth time in an hour in one process
- **THEN** that process sends one `error-loop` warning that names the stage, and the hour's later repeats send none

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
reads through the Redis cache, `GET /api/topics/:id`, whose user access and topic role read once through the request
memo, each page read for a visitor, whose second request sends no statement, and the film, discussion, and Scan status
reads, whose second request sends none. A change that bypasses a cached read SHALL fail its route's budget test.

Each page read SHALL also have a budget for its first, cold request, the number the page-reads capability states for its
page, counted on a fixture that returns a row to every branch of the read, because a fixture that returns no row never
runs the reads that run only with rows. Each page SHALL have a request budget too: its server render sends one api
request. The web's route tests SHALL hold the request budgets over one list in `packages/contracts` of each page's
requests, and the query budget test SHALL read the same list, because the api's test cannot load the web's routes.

#### Scenario: A warm request stays inside its budget

- **WHEN** a budget test requests its route twice
- **THEN** the second request's statement count is at or under the budget

#### Scenario: A bypassed cache fails the budget

- **WHEN** a cached read's key is changed so the second request misses
- **THEN** the route's budget test fails on the second request's statement count

#### Scenario: A cold page read is counted on a full fixture

- **WHEN** the profile's budget test runs
- **THEN** its fixture returns a row to the podcast episode, chapter, film, reaction, and team reads, and the count is
  the one a profile with rows sends, where the old fixture held 14 for a route that sent 26

#### Scenario: A second request from a render fails the request budget

- **WHEN** a change makes a page's loader send a second api request
- **THEN** the web's route test for that page fails

#### Scenario: One list names each page's requests

- **WHEN** the query budget test and the web's route tests run
- **THEN** both read each page's requests from the one list in `packages/contracts`, and the query budget test holds the
  summed statements of a page's listed requests under the page's budget

### Requirement: The worker serves its demand gauges at a Prometheus endpoint

The worker SHALL serve its demand as gauges at a Prometheus endpoint in its own process, for the platform's autoscaling
to read. A worker in the `films` queue group SHALL serve film demand: the renders that its film Workers have taken, a
render that waits for a render slot among them, plus the film queue's backlog divided by the queue's pollers. A queue
with no poller SHALL count its whole backlog. A worker in the `main` queue group SHALL serve scan demand at the same
endpoint.

#### Scenario: A film backlog raises film demand

- **WHEN** a film replica runs two renders while four films wait in the film queue behind one poller
- **THEN** its film demand gauge reads 6

#### Scenario: Two film replicas split the backlog

- **WHEN** two film replicas each run two renders while four films wait in the film queue behind two pollers
- **THEN** each replica's film demand gauge reads 4

#### Scenario: A film queue with no poller counts its whole backlog

- **WHEN** a film replica runs no render while three films wait in a film queue that no worker polls
- **THEN** its film demand gauge reads 3

#### Scenario: An idle film replica reads zero

- **WHEN** a film replica runs no render and the film queue is empty
- **THEN** its film demand gauge reads 0

#### Scenario: A scan backlog raises scan demand

- **WHEN** first Scans queue faster than the main workers start them
- **THEN** each main worker's scan demand gauge rises with the backlog

### Requirement: A demand gauge that cannot be read gives no number

If the worker cannot read a gauge's queue, its Prometheus endpoint SHALL answer with an error and no gauge, so the
platform's autoscaling keeps the replicas it has instead of scaling on a number that is wrong.

#### Scenario: Temporal cannot be read

- **WHEN** the platform reads a film replica's endpoint while the replica cannot describe the film queue
- **THEN** the endpoint answers 503 with no gauge

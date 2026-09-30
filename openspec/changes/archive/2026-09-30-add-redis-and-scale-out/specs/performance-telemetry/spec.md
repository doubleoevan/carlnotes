## MODIFIED Requirements

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

### Requirement: A crossed threshold alerts through Sentry

When a gauge crosses its threshold, the process that measured it SHALL send one Sentry warning event: a pool with a waiting request, an event loop whose delay exceeded 200 ms in the minute, a scan backlog whose oldest task has waited more than 15 minutes, or, on the api, a minute in which the Redis client was not connected. Each condition SHALL group as its own issue through a fixed fingerprint, SHALL be tagged `alert: performance`, and SHALL be sent at most once an hour per process, however long it lasts, so a condition every replica measures sends one warning per replica under the one issue. The event SHALL include the measured values and nothing else. Without `SENTRY_DSN`, the crossing SHALL still appear in the minute log and nothing SHALL be sent.

#### Scenario: A pool with waiting requests raises one issue

- **WHEN** the pool has a waiting request in three consecutive minutes
- **THEN** one warning event is sent for the first, grouped under the pool condition's issue, and the next two are only logged

#### Scenario: Each condition is its own issue

- **WHEN** requests wait for a connection and the event loop lags in the same minute
- **THEN** two warning events are sent, each grouped under its own condition's issue

#### Scenario: Every replica warns once under one issue

- **WHEN** Redis is unreachable to both api replicas for an hour
- **THEN** each replica sends one `redis-down` warning, both grouped under the one issue, and each names its instance

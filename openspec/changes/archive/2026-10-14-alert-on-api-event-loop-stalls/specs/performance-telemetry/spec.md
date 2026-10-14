## MODIFIED Requirements

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

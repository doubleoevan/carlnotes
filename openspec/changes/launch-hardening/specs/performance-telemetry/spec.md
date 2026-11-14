## MODIFIED Requirements

### Requirement: Each long-running process logs its gauges once a minute

The api, the web service, and the worker SHALL each write one JSON log line a minute with the process's name, the
instance it runs as, which is its host's name, the pool's `totalCount`, `idleCount`, and `waitingCount`, and the event
loop delay's p99 and largest value over the minute, after which the delay histogram SHALL reset. The instance tells one
replica's lines from another's. The web service's line SHALL name the process `web`, and a worker started in a role
SHALL name that role in its line, so a film replica's lines are told apart from a main worker's. The worker's line
SHALL also include the scan queue's poller count, backlog depth, and the oldest pending task's age, and the same three
numbers for the scheduled scan queue `topic-scans-scheduled`, the scheduled chapter queue
`episode-scheduled-chapters`, and the film queue `episode-videos`. A worker in a role SHALL include only the queues
its role polls. The api's and the web service's lines SHALL also include whether the Redis client is connected and the
minute's cache hits, cache misses, and Redis errors, after which those counts reset, the page renders the minute
started and the renders it shed, after which those counts reset too, and how many podcast cover draws wait in the
process's cover chain. The minute timer SHALL NOT keep a process alive, and the scheduled sweep SHALL NOT start one.
The log line SHALL be written whether or not any telemetry key is set.

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

- **WHEN** a worker in the `films` role writes its minute line
- **THEN** the line names the role and has the film queue's pollers, depth, and oldest age, and no scan queue's

#### Scenario: A main worker reports its queues

- **WHEN** a worker in the `main` role writes its minute line
- **THEN** the line names the role and has the pollers, depth, and oldest age of the scan queue, the scheduled scan
  queue, and the scheduled chapter queue

#### Scenario: Waiting cover draws show in the line

- **WHEN** podcast cover draws queue up on one replica
- **THEN** that replica's next minute line reports how many wait in its cover chain

### Requirement: The scan queue's backlog is read beside its pollers

Describing the scan queue SHALL return its poller count, its activity backlog depth, and the age of its oldest pending
activity task, from Temporal's queue stats. The scheduled scan queue, the scheduled chapter queue, and the film queue
SHALL be described the same way. When the server returns no stats, the depth SHALL fall back to the queue status's
backlog count hint and the age SHALL be reported as unknown, and neither case SHALL fail the caller. The describe call
SHALL keep its existing time limit. A describe call that fails SHALL NOT fail the caller either: the sweep SHALL
report the failed read, at most once an hour across runs as the monitoring-analytics capability states for a report
from the sweep, and SHALL go on to its next stage. The scheduled sweep SHALL keep reporting a queue with no poller,
and SHALL also report a backlog whose oldest task has waited longer than the backlog age limit.

#### Scenario: A backed-up queue is reported by the sweep

- **WHEN** the sweep runs while the oldest pending scan task has waited 20 minutes
- **THEN** the sweep reports the backlog with its depth and age, and still dispatches its Scans

#### Scenario: An older server still gives a depth

- **WHEN** the Temporal server responds to the describe call without stats
- **THEN** the depth comes from the backlog count hint, the age reads as unknown, and the sweep continues

#### Scenario: A server the sweep cannot read is reported

- **WHEN** the describe call fails on every sweep for an hour because the Temporal server is unreachable
- **THEN** one report of the failed read is sent in that hour, and each sweep still runs its later stages

### Requirement: A crossed threshold alerts through Sentry

If a gauge crosses its threshold, the process that measured it SHALL send one Sentry warning event: a pool with a
waiting request, on the api and the web service an event loop that stalled past 2 seconds or whose 99th percentile
delay passed 100 ms in the minute, a scan backlog whose oldest task has waited more than 15 minutes, on the api and the
web service a minute in which the Redis client was not connected, a minute with ten or more Redis errors while
connected, or a Redis server at eight tenths of its memory limit, on the worker a sweep whose last finish time is more
than ten minutes old, on any process one stage's error that reached the hourly report limit, which is the `error-loop`
condition the monitoring-analytics capability states, and on the sweep a UTC day whose recorded spend reached
`GLOBAL_DAILY_SPEND_ALERT_USD`. The worker's event loop delay and a shorter api stall SHALL appear only in the minute
log. Each condition SHALL group as its own issue through a fixed fingerprint, SHALL be tagged `alert: performance`, and
SHALL be sent at most once an hour per process, however long it lasts, so a condition every replica measures sends one
warning per replica under the one issue. The sweep is a new process on every run, so a warning from the sweep SHALL
first take a one-hour slot in Redis for its condition. It SHALL be sent only if it takes the slot or if Redis cannot
say. The event SHALL include the measured values, the stage for `error-loop`, and nothing else. Without `SENTRY_DSN`,
the crossing SHALL still appear in the minute log and nothing SHALL be sent.

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

## ADDED Requirements

### Requirement: The worker serves its demand gauges at a Prometheus endpoint

The worker SHALL serve its demand as gauges at a Prometheus endpoint in its own process, for the platform's autoscaling
to read. A worker in the `films` role SHALL serve film demand: the renders it is running plus the film queue's backlog
divided by the queue's pollers. A worker in the `main` role SHALL serve scan demand at the same endpoint, from the scan
work it is running and the scan queues' backlog.

#### Scenario: A film backlog raises film demand

- **WHEN** a film replica runs two renders while four films wait in the film queue behind one poller
- **THEN** its film demand gauge reads 6

#### Scenario: Two film replicas split the backlog

- **WHEN** two film replicas each run two renders while four films wait in the film queue behind two pollers
- **THEN** each replica's film demand gauge reads 4

#### Scenario: An idle film replica reads zero

- **WHEN** a film replica runs no render and the film queue is empty
- **THEN** its film demand gauge reads 0

#### Scenario: A scan backlog raises scan demand

- **WHEN** first Scans queue faster than the main workers start them
- **THEN** each main worker's scan demand gauge rises with the backlog

### Requirement: The worker warns if the sweep stops finishing

Each sweep SHALL save the time it finished to Redis as its last step. The worker SHALL read that time for its minute
line and SHALL cross a threshold if it is more than forty minutes old, so a sweep that stops running, or that dies
before it finishes, is reported by a process that is still running. Production's sweep runs every 15 minutes for at
most 10.

#### Scenario: A sweep that stops is reported

- **WHEN** no sweep has finished for forty-one minutes
- **THEN** the worker's next minute line shows the old finish time, and the worker sends one warning for it

#### Scenario: A sweep that dies early is reported

- **WHEN** every sweep for forty-one minutes exits before its last step
- **THEN** the saved finish time is more than forty minutes old, and the worker sends the same warning

#### Scenario: A sweep on schedule is quiet

- **WHEN** a sweep finishes every fifteen minutes
- **THEN** the worker's minute lines show a recent finish time, and no warning is sent

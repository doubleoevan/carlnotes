## MODIFIED Requirements

### Requirement: Each long-running process logs its gauges once a minute

The api, the web service, and the worker SHALL each write one JSON log line a minute with the process's name, the
instance it runs as, which is its host's name, the pool's `totalCount`, `idleCount`, and `waitingCount`, and the event
loop delay's p99 and largest value over the minute, after which the delay histogram SHALL reset. The instance tells one
replica's lines from another's. The worker's line SHALL also include the scan queue's poller count, backlog depth, and
the oldest pending task's age. The api's and the web service's lines SHALL also include whether the Redis client is
connected and the minute's cache hits, cache misses, and Redis errors, after which those counts reset. The minute timer
SHALL NOT keep a process alive, and the scheduled sweep SHALL NOT start one. The log line SHALL be written whether or
not any telemetry key is set.

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
- **THEN** the line's process name is the web service's, apart from the api's, with its own pool and Redis counts

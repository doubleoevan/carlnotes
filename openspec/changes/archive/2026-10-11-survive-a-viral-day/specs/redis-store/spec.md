## MODIFIED Requirements

### Requirement: One Redis store serves every caller, and a failed use of it returns null

The app SHALL reach Redis through one module in `db/`, built on Bun's built-in `RedisClient` from the `REDIS_URL`
setting, with no Redis package added. Every read and write SHALL go through one wrapper that returns a result on success
and null on any failure, including a client that is not connected and a command with no reply within two seconds, so a
caller always has a value to act on and no Redis failure ever reaches a request as an error or holds it. The wrapper
SHALL count each failed command, missed deadline, failed connection attempt, and dropped connection toward the minute's
gauges, and SHALL log the first failure of each minute. Three commands in a row that miss their deadline SHALL replace
the client through the store's own reconnect, since a wedged socket can stay open. A call made while a reconnect waits
SHALL fail at once without adding to the count. The client SHALL NOT queue commands while disconnected, so a command
against a dead connection fails at once instead of holding its request. The store SHALL own reconnection: a closed
connection reconnects after a delay of one second that doubles on each failure up to thirty seconds, with no limit on
attempts. The delay resets once a connection succeeds, and for the subscriber connection once its subscribes succeed.

#### Scenario: A failed read returns null

- **WHEN** Redis is unreachable and a caller reads a key
- **THEN** the wrapper returns null within the Redis connection timeout, counts one error, and the caller proceeds as if
  the key were absent

#### Scenario: A dead connection fails fast

- **WHEN** the connection is closed and a caller sends a command
- **THEN** the command fails at once instead of waiting for a reconnect, and the store schedules the reconnect on its
  own backoff

#### Scenario: Redis returns after an outage

- **WHEN** Redis becomes reachable again after several failed reconnects
- **THEN** the next attempt succeeds, the delay resets to one second, and the next call goes through

#### Scenario: A stalled command returns null at its deadline

- **WHEN** the connection is open and a command gets no reply
- **THEN** the wrapper returns null after two seconds and counts one error, and a late reply is ignored

#### Scenario: A wedged connection is replaced

- **WHEN** three commands in a row miss their deadline
- **THEN** the store closes the client and reconnects on its backoff

### Requirement: The api's minute line reports Redis

The api's minute gauge line SHALL include whether the Redis client is connected, how many cache hits, cache misses, and
Redis errors the minute counted, after which the counts reset, and the server's used and maximum memory, read with `INFO
memory`, with both memory fields left out if that read fails. A minute in which the client is not connected SHALL cross
a `redis-down` threshold. A minute with ten or more errors while the client is connected, which is how a full or
write-rejecting server reads, SHALL cross a `redis-errors` threshold. A server whose used memory reaches eight tenths of
its maximum SHALL cross a `redis-memory` threshold, and a server with no maximum never does. Each threshold sends one
Sentry warning, at most once an hour per process, like every other condition.

#### Scenario: A healthy minute reports its counts

- **WHEN** the api serves a minute of cached and counted requests with Redis up
- **THEN** the line reports connected, the hits, the misses, zero errors, and the server's memory

#### Scenario: An outage warns once an hour

- **WHEN** Redis is unreachable for three consecutive minutes
- **THEN** each line reports disconnected with its error count, one `redis-down` warning is sent for the first minute,
  and the next two are only logged

#### Scenario: A server near its memory limit warns

- **WHEN** the server reports used memory at nine tenths of its maximum
- **THEN** one `redis-memory` warning is sent with the two values

#### Scenario: A server rejecting writes warns

- **WHEN** the client stays connected and the minute counts twelve errors
- **THEN** one `redis-errors` warning is sent

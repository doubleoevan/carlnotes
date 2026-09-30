# redis-store Specification

## Purpose
TBD - created by archiving change add-redis-and-scale-out. Update Purpose after archive.
## Requirements
### Requirement: One Redis store serves every caller, and a failed use of it returns null

The app SHALL reach Redis through one module in `db/`, built on Bun's built-in `RedisClient` from the `REDIS_URL` setting, with no Redis package added. Every read and write SHALL go through one wrapper that returns a result on success and null on any failure, including a client that is not connected, so a caller always has a value to act on and no Redis failure ever reaches a request as an error. The wrapper SHALL count each failed command, failed connection attempt, and dropped connection toward the minute's gauges, and SHALL log the first failure of each minute. A call made while a reconnect waits SHALL fail at once without adding to the count. The client SHALL NOT queue commands while disconnected, so a command against a dead connection fails at once instead of holding its request. The store SHALL own reconnection: a closed connection reconnects after a delay of one second that doubles on each failure up to thirty seconds, with no limit on attempts. The delay resets once a connection succeeds, and for the subscriber connection once its subscribes succeed.

#### Scenario: A failed read returns null

- **WHEN** Redis is unreachable and a caller reads a key
- **THEN** the wrapper returns null within the Redis connection timeout, counts one error, and the caller proceeds as if the key were absent

#### Scenario: A dead connection fails fast

- **WHEN** the connection is closed and a caller sends a command
- **THEN** the command fails at once instead of waiting for a reconnect, and the store schedules the reconnect on its own backoff

#### Scenario: Redis returns after an outage

- **WHEN** Redis becomes reachable again after several failed reconnects
- **THEN** the next attempt succeeds, the delay resets to one second, and the next call goes through

### Requirement: A frequently read response is served from a short-lived read-through cache

The Redis store SHALL offer a read-through cache of JSON values. A hit returns the stored value. A miss runs the loader, stores its result for the given time to live, and returns it. A Redis failure, or a stored value that does not parse, runs the loader and returns its result without storing it. A cached value SHALL never outlive its time to live, and a caller SHALL be able to delete a key so a write it just made is read fresh.

#### Scenario: A second read inside the time to live is a hit

- **WHEN** a value is loaded and read again inside its time to live
- **THEN** the second read returns the stored value and the loader does not run

#### Scenario: A deleted key reloads

- **WHEN** a caller deletes a key and reads it again
- **THEN** the loader runs and the fresh value is stored

#### Scenario: Redis down means no cache

- **WHEN** Redis is unreachable
- **THEN** every read runs its loader and returns the loaded value, and the response is what it would be without the cache

### Requirement: A shared fixed-window counter backs every per-caller rate limit

The Redis store SHALL offer a fixed-window counter: one atomic operation that increments a key, starts the key's expiry at the window length if the increment is the window's first, and returns the count with the moment the window resets. The window SHALL start atomically with its first hit, so a process that dies mid-operation can never leave a key that does not expire. A caller SHALL be able to decrement a key to refund a hit, and a refund on a window that already closed SHALL create nothing, so no key is ever left without an expiry. A refund that arrives after its window closed and the next one opened lowers the next window's count, which allows at most one more hit there. On a Redis failure the counter SHALL return null, and every limiter built on it SHALL allow the request, since each limits spend or nuisance and protects no data.

#### Scenario: The window starts on the first hit

- **WHEN** a key is incremented for the first time with a one-minute window
- **THEN** the count is one, the reset moment is one minute from now, and the key expires at that moment

#### Scenario: Two processes share one window

- **WHEN** two api processes each increment the same key
- **THEN** the second sees a count of two, since the count lives in Redis and not in either process

#### Scenario: A refund lowers the count

- **WHEN** a hit is refunded
- **THEN** the count is one lower and the window's expiry is unchanged

#### Scenario: A refund after the window closed creates nothing

- **WHEN** a hit is refunded after its window's key expired
- **THEN** no key is created, and the next hit starts a fresh window with its expiry

#### Scenario: Redis down allows the request

- **WHEN** Redis is unreachable and a limiter increments its key
- **THEN** the counter returns null and the limiter allows the request

### Requirement: Messages fan out over Redis pub/sub through one subscriber connection per process

The Redis store SHALL offer publish and subscribe. Publishing SHALL send one message on one channel and report whether the send succeeded. Subscribing SHALL register a handler for a channel on one subscriber connection the process holds, built on the first subscribe, since a subscribed connection can send no other command. When the subscriber connection closes, the store SHALL reconnect with the same backoff, one second doubling to thirty, reset once a subscribe succeeds, on a fresh client each attempt, and SHALL subscribe every registered channel on the fresh client. A fresh client is needed because Bun's client keeps its subscription listeners across a drop, so subscribing again on the same client would run every handler twice. A subscribe that fails on an open subscriber connection SHALL make the store reconnect the same way, so the fresh client subscribes the failed channel with the rest. Each message SHALL reach each handler once, however many reconnects came before. Nothing published while a subscriber was disconnected is replayed.

#### Scenario: A message reaches a subscriber in another process

- **WHEN** one process publishes on a channel another process subscribed to
- **THEN** the other process's handler runs with the message

#### Scenario: A reconnect resubscribes

- **WHEN** the subscriber connection drops and reconnects
- **THEN** every channel subscribed before the drop receives messages again without any caller subscribing again, and each handler runs once per message

#### Scenario: A failed subscribe retries on a fresh client

- **WHEN** a subscribe fails on an open subscriber connection
- **THEN** the store reconnects on a fresh client after the backoff, and every registered channel, the failed one included, receives messages again

#### Scenario: A failed publish is reported to its caller

- **WHEN** Redis is unreachable and a caller publishes
- **THEN** the publish returns a failure instead of throwing an error, and the caller decides what to do locally

### Requirement: A local Redis runs beside the other dev services

`docker-compose.yml` SHALL run a Redis 7.2 or later container bound to loopback on port 6379, and `.env.example` SHALL name `REDIS_URL=redis://localhost:6379` as the dev value, the same host and port Bun's client falls back to if the variable is unset. Production SHALL set `REDIS_URL` to the Northflank Redis addon's master url. The app SHALL start and serve with `REDIS_URL` pointing at nothing, every Redis use falling through, so a checkout without the container still runs.

#### Scenario: carl-up brings Redis up

- **WHEN** a developer runs `bun run carl-up`
- **THEN** Redis answers on localhost:6379 and the api's minute line reports it connected

#### Scenario: No Redis, still serving

- **WHEN** the api starts with no Redis reachable
- **THEN** every route still serves, and the minute line reports Redis disconnected

### Requirement: The api's minute line reports Redis

The api's minute gauge line SHALL include whether the Redis client is connected and how many cache hits, cache misses, and Redis errors the minute counted, after which the counts reset. A minute in which the client is not connected SHALL cross a `redis-down` threshold that sends one Sentry warning, sent at most once an hour per process, like every other condition.

#### Scenario: A healthy minute reports its counts

- **WHEN** the api serves a minute of cached and counted requests with Redis up
- **THEN** the line reports connected, the hits, the misses, and zero errors

#### Scenario: An outage warns once an hour

- **WHEN** Redis is unreachable for three consecutive minutes
- **THEN** each line reports disconnected with its error count, one `redis-down` warning is sent for the first minute, and the next two are only logged


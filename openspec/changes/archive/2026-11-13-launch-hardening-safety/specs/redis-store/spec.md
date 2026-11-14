## MODIFIED Requirements

### Requirement: One Redis store serves every caller, and a failed use of it returns null

The app SHALL reach Redis through one module in `packages/db/`, built on Bun's built-in `RedisClient` from the
`REDIS_URL` setting, with no Redis package added. Every read and write SHALL go through one wrapper that returns a
result on success and null on any failure, including a client that is not connected and a command with no reply within
two seconds, so a caller always has a value to act on and no Redis failure ever reaches a request as an error or holds
it, apart from an account close: while Redis is unreachable a close SHALL respond 503 and close nothing, so a closed
account's session can never survive in Redis. The wrapper SHALL count each failed command, missed deadline, failed
connection attempt, and dropped connection toward the minute's gauges, and SHALL log the first failure of each minute.
Three commands in a row that miss their deadline SHALL replace the client through the store's own reconnect, since a
wedged socket can stay open. A call made while a reconnect waits SHALL fail at once without adding to the count. The
client SHALL NOT queue commands while disconnected, so a command against a dead connection fails at once instead of
holding its request. The store SHALL own reconnection: a closed connection reconnects after a delay of one second that
doubles on each failure up to thirty seconds, with no limit on attempts. The delay resets once a connection succeeds,
and for the subscriber connection once its subscribes succeed.

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

#### Scenario: An account close is rejected while Redis is unreachable

- **WHEN** a user closes their account while Redis is unreachable
- **THEN** the api responds 503, the account and its sessions are unchanged, and a close sent after Redis responds
  again succeeds

#### Scenario: Every other request is served while Redis is unreachable

- **WHEN** Redis is unreachable and a person loads a public profile, a topic page, and the home, signs in, counts a
  view, and sends a chat turn
- **THEN** each request is served without an error from Redis

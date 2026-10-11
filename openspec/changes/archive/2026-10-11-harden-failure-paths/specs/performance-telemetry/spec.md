## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: A cached route has a query budget

Each cached route SHALL have a test that requests it twice against a stubbed pool and a fake Redis and asserts the
second request's statement count stays at or under the route's budget: `GET /api/rooms/mention-count` and `GET
/api/topics/:id?poll=1`, which read through the Redis cache, `GET /api/topic-feed` for a visitor, whose section order
reads through the Redis cache, `GET /api/topics/:id`, whose user access and topic role read once through the request
memo, each page read for a visitor, whose second request sends no statement, and the film, discussion, and Scan status
reads, whose second request sends none. A change that bypasses a cached read SHALL fail its route's budget test. `GET
/api/badges` SHALL have such a budget too, because its counts read through their per-user caches.

Each page read SHALL also have a budget for its first, cold request, the number the page-reads capability states for its
page, counted on a fixture that returns a row to every branch of the read, because a fixture that returns no row never
runs the reads that run only with rows. Each page SHALL have a request budget too: its server render sends one api
request. The web's route tests SHALL hold the request budgets over one list in `packages/contracts` of each page's
requests, and the query budget test SHALL read the same list, because the api's test cannot load the web's routes.

A layout SHALL have a request budget at load too, named in the same list and checked by the web's route tests, which
fail on a further request: three for a signed-in layout, the session read, the badges read, and the rooms read, and one
for a visitor's layout, the session read.

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

#### Scenario: A warm badges read stays inside its budget

- **WHEN** the budget test requests `GET /api/badges` twice with no write in between
- **THEN** the second request's statement count is at or under the route's budget

#### Scenario: A fourth layout request fails the budget

- **WHEN** a change makes a signed-in layout send a fourth request at load
- **THEN** the layout's request budget test fails

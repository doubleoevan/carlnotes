## MODIFIED Requirements

### Requirement: The connection pool fits a request's concurrency and fails loudly when full

Each long-running process SHALL size its connection pool from the database at startup: it reads `SHOW max_connections`
and sets the pool's size to 0.9 times that value, the share Neon's connection pooler holds on its server side for one
user and database, divided by the pool count, the number of processes that can hold a pool at once. The pool count is a
constant in the database package's `index.ts`, 11 by default, counting two api replicas, two web replicas, two worker
replicas, the sweep, the budget reset, and three more for the replicas a rolling deploy overlaps with and the release
jobs. `DATABASE_POOL_COUNT` SHALL override the pool count, and `DATABASE_POOL_MAX` SHALL override the computed size
itself. The processes that size their pool are the api, the web service, the Temporal worker, the sweep, and the budget
reset. A short-lived job such as the migration or the docs embed keeps the default. Until the read completes, and if the
read fails, the pool SHALL hold the default of 15, the size a 0.25 CU compute allows, and a failed read SHALL be
reported to Sentry. A process with no `DATABASE_URL`, such as a test, SHALL keep the default and read nothing. Each
process SHALL log the size it computed, the `max_connections` it read, and the pool count. A request that finds no free
connection SHALL wait at most the connection timeout that `DATABASE_CONNECT_TIMEOUT_MS` sets, with a default of 10
seconds, and then fail with an error instead of waiting forever. An error a route does not handle SHALL be reported to
Sentry, and the route SHALL respond 500 as it does today. Every process reaches Postgres through the connection pooler
alone, holding no connection outside it. A computed size below what one request sends at once, which a 0.25 CU compute
gives, queues that request's queries inside its own pool and fails nothing.

#### Scenario: A signed-in feed request gets its connections

- **WHEN** one signed-in feed request sends its queries on an otherwise idle process
- **THEN** no query waits for a connection, and the pool's waiting count stays at zero

#### Scenario: Two feed requests at once do not queue

- **WHEN** two signed-in feed requests arrive at once on an otherwise idle process
- **THEN** no query waits for a connection

#### Scenario: A burst of feed requests queues and drains

- **WHEN** 50 feed requests arrive at once on the dev api
- **THEN** every request succeeds well inside the connection timeout, and the pool's waiting count returns to zero once
  they finish

#### Scenario: A request past the timeout fails visibly

- **WHEN** every connection stays taken past the connection timeout
- **THEN** the waiting request fails with a 500, and its error reaches Sentry as an issue

#### Scenario: Replicas fit the compute

- **WHEN** a process starts against a database whose `max_connections` is 901 with the default pool count of 11
- **THEN** its pool holds at most 73 connections, and eleven such pools hold 803, inside the connection pooler's 810

#### Scenario: The size is computed from the read

- **WHEN** the read returns `max_connections` 209 and the pool count is 11
- **THEN** the pool's size is 17, and the startup line names 17, 209, and 11

#### Scenario: The override wins

- **WHEN** `DATABASE_POOL_MAX` is set to 30 and the read returns 901
- **THEN** the pool's size is 30

#### Scenario: A failed read keeps the default and reports

- **WHEN** the read throws at startup
- **THEN** the pool's size stays 15, and the failure reaches Sentry

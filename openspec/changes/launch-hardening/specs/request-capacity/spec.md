## MODIFIED Requirements

### Requirement: The connection pool fits a request's concurrency and fails loudly when full

Each long-running process SHALL size its connection pool from the database at startup: it reads `SHOW max_connections`
and takes 0.9 times that value, the share Neon's connection pooler holds on its server side for one user and database.
That number divided by the pool count and rounded down is one pool share, and the pool's size SHALL be the process's
own pool shares times it. The api, the web service, the sweep, the budget reset, and a Temporal worker in the `films`
role take one pool share, and every other Temporal worker takes two. The pool count is the sum of the pool shares of
the processes that can hold a pool at once. It is a constant in `packages/db/index.ts`, 14 by default, counting two api
replicas, two web replicas, two main worker replicas at two pool shares each, one film replica, the sweep, the budget
reset, and three more for the replicas a rolling deploy overlaps with and the release jobs. `DATABASE_POOL_COUNT` SHALL
override the pool count, and production SHALL set it to the sum with every service at its autoscaling maximum.
`DATABASE_POOL_MAX` SHALL override the computed size itself. The processes that size their pool are the api, the web
service, the Temporal worker in either role, the sweep, and the budget reset. A short-lived job such as the migration
or the docs embed keeps the default. Until the read completes, and if the read fails, the pool SHALL hold the default
of 15, the size a 0.25 CU compute allows, and a failed read SHALL be reported to Sentry. A process with no
`DATABASE_URL`, such as a test, SHALL keep the default and read nothing. Each process SHALL log the size it computed,
the `max_connections` it read, and the pool count. A request that finds no free connection SHALL wait at most the
connection timeout that `DATABASE_CONNECT_TIMEOUT_MS` sets, with a default of 10 seconds, and then fail with an error
instead of waiting forever. An error a route does not handle SHALL be reported to Sentry, and the route SHALL respond
500 as it does today. Every process reaches Postgres through the connection pooler alone, holding no connection outside
it. A computed size below what one request sends at once, which a 0.25 CU compute gives, queues that request's queries
inside its own pool and fails nothing.

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

- **WHEN** a process starts against a database whose `max_connections` is 901 with the default pool count of 14
- **THEN** a pool share is 57 connections, so an api replica's pool holds at most 57 and a main worker's at most 114,
  and the fourteen pool shares hold 798, inside the connection pooler's 810

#### Scenario: The size is computed from the read

- **WHEN** the read returns `max_connections` 209 and the pool count is 14
- **THEN** an api replica's pool size is 13 and its startup line names 13, 209, and 14, and a main worker's pool size
  is 26

#### Scenario: The override wins

- **WHEN** `DATABASE_POOL_MAX` is set to 30 and the read returns 901
- **THEN** the pool's size is 30

#### Scenario: A failed read keeps the default and reports

- **WHEN** the read throws at startup
- **THEN** the pool's size stays 15, and the failure reaches Sentry

#### Scenario: Production counts every service at its maximum

- **WHEN** the app service, the web service, the main worker, and the film service may each scale to four replicas
- **THEN** `DATABASE_POOL_COUNT` is 25 pool shares: four for the api, four for the web service, eight for the main
  workers, four for the film replicas, one each for the sweep and the budget reset, and three for overlap and jobs
- **AND** at `max_connections` 901 a pool share is 32 connections, a main worker's pool holds at most 64, and the 25
  pool shares hold 800, inside the connection pooler's 810

#### Scenario: A film replica takes one pool share

- **WHEN** a Temporal worker starts in the `films` role with `max_connections` 901 and a pool count of 25
- **THEN** its pool holds at most 32 connections, half a main worker's

### Requirement: A visitor's render past the concurrency limit is shed

Each replica of the app service and of the web service SHALL count the page renders in progress for requests without
a session cookie, from the start of the render until the ui's server returns the page's headers, and a visitor's
render that would pass `RENDER_CONCURRENCY`, 16 by default, SHALL get a 503 at once, with `Retry-After: 2` and
`Cache-Control: private, no-cache`, so the edge keeps serving its copy, stale if the origin errs, and caches nothing
from the shed response. The 503's body SHALL be a small HTML page that says the site is busy and requests the same
address again after two seconds, never a bare line of text. Each replica SHALL total the renders it starts and the
renders it sheds each minute for its gauge line, as the performance-telemetry capability states. A render for a
request with a session cookie SHALL be neither counted nor shed. A render SHALL release its count however it ends.

#### Scenario: A burst past the limit is shed

- **WHEN** a seventeenth visitor render arrives while sixteen are in progress on one replica
- **THEN** it gets a 503 with a two-second retry, and the sixteen finish

#### Scenario: A signed-in render is never shed

- **WHEN** a render with a session cookie arrives while the visitor limit is reached
- **THEN** it renders

#### Scenario: Signed-in renders never shed a visitor

- **WHEN** a visitor's render arrives while only signed-in renders are in progress, however many
- **THEN** it renders

#### Scenario: A failed render releases its count

- **WHEN** a render throws
- **THEN** the next visitor render is counted as if the failed one had finished

#### Scenario: A shed visitor gets a page that retries

- **WHEN** a browser's page request is shed
- **THEN** the 503's body is an HTML page that says the site is busy, and the browser requests the same address again
  two seconds later without the visitor doing anything

#### Scenario: A minute's sheds are counted

- **WHEN** a replica renders 40 pages and sheds 78 in one minute
- **THEN** its gauge line for that minute reports 40 renders and 78 sheds, and the next minute's counts start from
  zero

#### Scenario: Each service sheds on its own count

- **WHEN** sixteen visitor renders are in progress on a `web` replica while an `app` replica renders none
- **THEN** a seventeenth visitor render on the `web` replica is shed, and a visitor render that reaches the `app`
  replica renders

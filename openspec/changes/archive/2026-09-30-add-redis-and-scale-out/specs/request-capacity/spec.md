## MODIFIED Requirements

### Requirement: The connection pool fits a request's concurrency and fails loudly when full

Each process's connection pool SHALL allow well more connections than one request sends at once, with a size that configuration sets through `DATABASE_POOL_MAX` and a default of 40. A request that finds no free connection SHALL wait at most the connection timeout that `DATABASE_CONNECT_TIMEOUT_MS` sets, with a default of 10 seconds, and then fail with an error instead of waiting forever. An error a route does not handle SHALL be reported to Sentry, and the route SHALL respond 500 as it does today. Every process reaches Postgres through the connection pooler alone, holding no connection outside it. The pools that can be open at once are every api and worker replica's pool at `DATABASE_POOL_MAX`, plus one each for the sweep and the budget reset, which can run at the same time. Their sum SHALL fit 0.9 times the Neon compute's `max_connections`, which is what the connection pooler's server side holds for one user and database. If it does not, the replica count or the per-process pool SHALL be lowered until it does.

#### Scenario: A signed-in feed request gets its connections

- **WHEN** one signed-in feed request sends its queries on an otherwise idle process
- **THEN** no query waits for a connection, and the pool's waiting count stays at zero

#### Scenario: Two feed requests at once do not queue

- **WHEN** two signed-in feed requests arrive at once on an otherwise idle process
- **THEN** no query waits for a connection

#### Scenario: A burst of feed requests queues and drains

- **WHEN** 50 feed requests arrive at once on the dev api
- **THEN** every request succeeds well inside the connection timeout, and the pool's waiting count returns to zero once they finish

#### Scenario: A request past the timeout fails visibly

- **WHEN** every connection stays taken past the connection timeout
- **THEN** the waiting request fails with a 500, and its error reaches Sentry as an issue

#### Scenario: Replicas fit the compute

- **WHEN** the api and the worker each run as two replicas while the sweep and the budget reset both run, which makes six pools, on a 0.5 CU compute whose `max_connections` is 225
- **THEN** every process sets `DATABASE_POOL_MAX=33` so the total of 198 fits the connection pooler's 202, and on a 0.25 CU compute whose `max_connections` is 112 every process sets 16 so 96 fits 100

### Requirement: A request reads its user's access and each topic role once

Within one request, the user's access row, their role, plan, and budget override, SHALL be read at most once, and their role on a given topic at most once, however many permission checks the request makes. A request that sends a write statement SHALL read both again afterwards. Code outside a request, such as the worker, SHALL read the database directly, and the billing paths SHALL keep reading the user row with their own query. The one exception is the scheduled sweep, which SHALL read each owner's remaining daily scan quota once per sweep and lower its own copy by one for each Scan it starts, since the sweep writes constantly and a request memo would clear on every write.

#### Scenario: A topic page reads the access row once

- **WHEN** a signed-in user opens a topic page whose permission checks each ask for their access
- **THEN** the request sends one read of the user's access row

#### Scenario: A write is followed by a fresh read

- **WHEN** a request reads a user's access, sends a write statement, and reads the access again
- **THEN** the second read goes to the database

#### Scenario: The worker reads directly

- **WHEN** a worker activity checks a user's scan quota
- **THEN** the access row is read from the database, with no memo

#### Scenario: The sweep reads an owner's quota once

- **WHEN** the sweep reaches ten due Topics of one owner
- **THEN** it reads that owner's remaining scan quota once, starts as many as remain, and skips the rest as over quota without another read

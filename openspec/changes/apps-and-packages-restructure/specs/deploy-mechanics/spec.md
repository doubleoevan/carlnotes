## MODIFIED Requirements

### Requirement: The app service exposes a liveness route

The app service and the web service SHALL each answer `GET /api/health` on their own port with 200 and a JSON body
reporting that the process is up. The route SHALL NOT query the database, and SHALL NOT require or resolve a session, so
that an unreachable database never presents as a dead instance. Northflank's health check reaches each service by its
port, so the web service answers the route on its port whatever path routing sends `/api` to on the public domain.

#### Scenario: A healthy process answers

- **WHEN** the platform requests `/api/health`
- **THEN** the app answers 200 with a JSON status body

#### Scenario: An unreachable database does not fail the check

- **WHEN** the process is running but no database connection can be made
- **THEN** `/api/health` still answers 200, so the platform leaves the instance alone rather than restarting it

#### Scenario: The web service answers its own check

- **WHEN** the platform requests `/api/health` on the web service's port
- **THEN** the web service answers 200 without forwarding to the app service

### Requirement: A deep health check proves the database responds

The app service and the web service SHALL each respond to `GET /api/health/deep` by running one trivial query with a
two-second limit. When the query succeeds, it SHALL respond 200 with a JSON body of the status, the query's latency in
milliseconds, and the connection pool's `totalCount`, `idleCount`, and `waitingCount`. When the query fails or runs past
the limit, it SHALL respond 503 with the status and the pool counts. The route SHALL NOT require or resolve a session,
SHALL be sent with `Cache-Control: no-store`, and SHALL NOT be traced. The liveness route `/api/health` SHALL stay
query-free, since the platform restarts the container on it, and a database outage SHALL NOT change its response. The
uptime monitor SHALL watch each service's deep check through that service's own Northflank hostname.

#### Scenario: A healthy database passes the deep check

- **WHEN** a monitor requests `/api/health/deep` while the database is reachable
- **THEN** the response is 200 with the query's latency and the pool's three counts

#### Scenario: An unreachable database fails only the deep check

- **WHEN** the database stops answering
- **THEN** `/api/health/deep` responds 503 within about two seconds, and `/api/health` still responds 200, so the
  platform does not restart a healthy process

#### Scenario: The deep check reads no session

- **WHEN** a request to `/api/health/deep` brings a session cookie
- **THEN** no session is looked up, and the only query the request sends is the trivial one

### Requirement: The api and the worker run as replicas within the pool rule

The app service, the web service, and the temporal-worker service SHALL each run as one or more replicas, set in the
platform, and the count SHALL respect the pool rule the request-capacity capability states: each process sizes its own
pool from the database's `max_connections` and the pool count, so a replica count change SHALL set
`DATABASE_POOL_COUNT` to the new number of processes that can hold a pool at once, counting every instance of every
service at its autoscaling maximum, and nothing else. The worker needs no coordination beyond Temporal's own: each
activity is handed to one worker, so a second worker replica is safe as it is. The api and the web service hold no
per-process limit or cache: every limit counts in Redis, the section order and the other short-lived caches read through
Redis, and the memory a process keeps is a fallback for a Redis outage alone.

#### Scenario: A second worker scans

- **WHEN** the worker runs as two replicas and the sweep dispatches twenty Scans
- **THEN** each Scan runs on exactly one replica, and the two replicas run up to the sum of their concurrency at once

#### Scenario: A second api serves

- **WHEN** the api runs as two replicas behind the platform's load balancer
- **THEN** a user's requests may reach either, and every limit, count, and session reads the same on both

#### Scenario: A third api replica sets the pool count

- **WHEN** the api's replica count goes from two to three
- **THEN** `DATABASE_POOL_COUNT` goes from 11 to 12, and every process's next start sizes its pool from that

#### Scenario: The web service counts in the pool

- **WHEN** the web service runs as two replicas beside two api replicas
- **THEN** the pool count covers both services' replicas, their rolling overlap, the worker, the sweep, and the reset

### Requirement: The budget reset runs as its own scheduled job

The monthly budget reset SHALL run as its own script, `bun run reset:monthly-budgets`, on a platform cron once a day
shortly after midnight UTC, under its own database claim, the same kind the sweep uses, so an overlapping reset exits
without doing the work. It SHALL NOT run inside the scheduled sweep. The README's process table SHALL name the job
beside the scheduler. Every other process Northflank starts, the Temporal worker, the sweep, the migrate, edge purge,
and docs embed jobs, SHALL likewise start through a root script, as the workspace-structure capability states.

#### Scenario: The reset runs apart from the sweep

- **WHEN** the reset job and a sweep run in the same minute
- **THEN** the sweep dispatches its Scans without waiting for a single key to be replaced, and the reset replaces keys
  without a sweep in its process

#### Scenario: A second reset exits

- **WHEN** a reset starts while another reset holds the claim
- **THEN** the second exits at once having replaced nothing

## ADDED Requirements

### Requirement: The web service is routed by path and rolls back by routing

The public domain SHALL reach the two services through Northflank path routing on the domain: the base path routes to
the web service, and prefix routes for `/api`, `/mcp`, and `/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource` route to the app service, with higher-priority routes sending the image and feed
paths under `/api` (`/api/podcast-covers`, `/api/podcast-feeds`, `/api/favicons`, `/api/avatars`, `/api/team-avatars`,
and the `preview.png` and `card.png` paths) to the web service. Every Cloudflare cache rule SHALL keep its meaning,
since no path changes. The `release-main` pipeline SHALL deploy the web service from the same build after the app
service. Rolling back SHALL be pointing the base path back at the app service and removing the prefix routes.

#### Scenario: A page and its api call reach different services

- **WHEN** a visitor opens a public topic page
- **THEN** the page is rendered by the web service, and the page's loader read the topic from the app service over the
  private network

#### Scenario: Rolling back is a routing change

- **WHEN** the base path is pointed back at the app service
- **THEN** every path responds from the app service with no deploy

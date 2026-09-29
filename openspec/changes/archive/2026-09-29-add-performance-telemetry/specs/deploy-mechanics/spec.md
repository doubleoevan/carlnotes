## ADDED Requirements

### Requirement: A deep health check proves the database responds

The app service SHALL respond to `GET /api/health/deep` by running one trivial query with a two-second limit. When the query succeeds, it SHALL respond 200 with a JSON body of the status, the query's latency in milliseconds, and the connection pool's `totalCount`, `idleCount`, and `waitingCount`. When the query fails or runs past the limit, it SHALL respond 503 with the status and the pool counts. The route SHALL NOT require or resolve a session, SHALL be sent with `Cache-Control: no-store`, and SHALL NOT be traced. The liveness route `/api/health` SHALL stay query-free, since the platform restarts the container on it, and a database outage SHALL NOT change its response.

#### Scenario: A healthy database passes the deep check

- **WHEN** a monitor requests `/api/health/deep` while the database is reachable
- **THEN** the response is 200 with the query's latency and the pool's three counts

#### Scenario: An unreachable database fails only the deep check

- **WHEN** the database stops answering
- **THEN** `/api/health/deep` responds 503 within about two seconds, and `/api/health` still responds 200, so the platform does not restart a healthy process

#### Scenario: The deep check reads no session

- **WHEN** a request to `/api/health/deep` brings a session cookie
- **THEN** no session is looked up, and the only query the request sends is the trivial one

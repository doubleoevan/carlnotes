# deploy-mechanics Specification

## Purpose
TBD - created by archiving change add-deploy-health-and-migrations. Update Purpose after archive.
## Requirements
### Requirement: The app service exposes a liveness route

The app service SHALL answer `GET /api/health` with 200 and a JSON body reporting that the process is up. The route SHALL NOT query the database, and SHALL NOT require or resolve a session, so that an unreachable database never presents as a dead instance.

#### Scenario: A healthy process answers

- **WHEN** the platform requests `/api/health`
- **THEN** the app answers 200 with a JSON status body

#### Scenario: An unreachable database does not fail the check

- **WHEN** the process is running but no database connection can be made
- **THEN** `/api/health` still answers 200, so the platform leaves the instance alone rather than restarting it

### Requirement: Schema migrations are applied by a one-shot job

Pending migrations SHALL be applied by a script that runs once and exits, executed as a deploy job against the deployed image before the new service rolls out. The container start command SHALL NOT apply migrations, so that instances starting concurrently cannot race on the same migration.

The script SHALL apply only migrations the database has not already recorded, SHALL resolve the migration folder relative to its own location rather than the working directory, and SHALL close its database connection so the job exits on its own.

#### Scenario: A pending migration is applied once

- **WHEN** the job runs against a database missing the newest migration
- **THEN** that migration is applied, recorded, and the process exits

#### Scenario: An already-migrated database is untouched

- **WHEN** the job runs against a database that already records every migration in the journal
- **THEN** nothing is applied and the process exits successfully

#### Scenario: Starting the server does not migrate

- **WHEN** a container starts
- **THEN** it serves requests without applying any migration

### Requirement: One migration mechanism serves local and production

Migrations SHALL be applied through the same script locally and in production, and that script SHALL depend only on packages present in the production image. It SHALL NOT depend on the `drizzle-kit` CLI, which is a dev dependency the production install prunes, or on a config file the image does not carry.

#### Scenario: The local command runs the deploy script

- **WHEN** a developer runs `bun run db:migrate`
- **THEN** it runs the same script the deploy job runs, against the database their environment points at

#### Scenario: The job runs from the production image

- **WHEN** the job runs on an image built with production dependencies only
- **THEN** it resolves its migrator and database driver without a missing-package failure

### Requirement: The scanner runs as its own service reachable by the app and the worker

The LLM Guard scanner SHALL be deployed as its own container service on the platform, addressed by the app and the worker through one configured url rather than embedded in the app image, since it is a Python service and the app runtime is Bun. The local development stack SHALL be able to run the same image, so a scanner-dependent path can be exercised without deploying. Its url SHALL be optional: unset means scanning is off and every path behaves as an unscanned build.

#### Scenario: The app reaches the scanner by url

- **WHEN** the scanner service is deployed and its url is configured
- **THEN** the app and the worker scan through that url, and no scanner code runs inside the app image

#### Scenario: The stack runs without the scanner

- **WHEN** the scanner url is unset, as in a self-hosted deployment
- **THEN** every service starts and runs normally with scanning disabled

### Requirement: An external monitor polls the liveness route

Availability SHALL be watched from outside the deployment by a monitor that polls the public `/api/health` route and alerts on failure, rather than by any in-app scheduler. The route SHALL remain unauthenticated and database-free, so what the monitor measures is process reachability.

#### Scenario: An unreachable app alerts

- **WHEN** the deployed app stops answering `/api/health`
- **THEN** the external monitor alerts, with no in-app job responsible for noticing

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


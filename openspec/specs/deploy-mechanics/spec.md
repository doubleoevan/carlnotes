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

Pending migrations SHALL be applied by a script that runs once and exits, executed as a deploy job against the deployed
image before the new service rolls out. The container start command SHALL NOT apply migrations, so that instances
starting concurrently cannot race on the same migration.

The script SHALL apply only migrations the database has not already recorded, SHALL resolve the migration folder
relative to its own location instead of the working directory, and SHALL close its database connection so the job exits
on its own. After migrating, the script SHALL set the app role's `statement_timeout` to 30 seconds in the app's
database, as the request-capacity capability states, and a failure to set it, such as for a role without the privilege,
SHALL be logged without failing the job.

#### Scenario: A pending migration is applied once

- **WHEN** the job runs against a database missing the newest migration
- **THEN** that migration is applied, recorded, and the process exits

#### Scenario: An already-migrated database is untouched

- **WHEN** the job runs against a database that already records every migration in the journal
- **THEN** nothing is applied and the process exits successfully

#### Scenario: Starting the server does not migrate

- **WHEN** a container starts
- **THEN** it serves requests without applying any migration

#### Scenario: The job bounds the role's statements

- **WHEN** the job finishes migrating
- **THEN** the role's statements in the app's database are cancelled after 30 seconds

### Requirement: One migration mechanism serves local and production

Migrations SHALL be applied through the same script locally and in production, and that script SHALL depend only on packages present in the production image. It SHALL NOT depend on the `drizzle-kit` CLI, which is a dev dependency the production install prunes, or on a config file the image does not carry.

#### Scenario: The local command runs the deploy script

- **WHEN** a developer runs `bun run db:migrate`
- **THEN** it runs the same script the deploy job runs, against the database their environment points at

#### Scenario: The job runs from the production image

- **WHEN** the job runs on an image built with production dependencies only
- **THEN** it resolves its migrator and database driver without a missing-package failure

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

### Requirement: The app listens on the configured port

The app service SHALL listen on the port the `PORT` environment variable names, and on 3000 if it is unset, so two api processes can run side by side on one machine and the platform can place a replica on the port it chooses. The server's export SHALL omit a fixed port and let Bun read the variable, and the Dockerfile SHALL keep exposing 3000 as the default.

#### Scenario: Two api processes on one machine

- **WHEN** a developer starts the api twice with `PORT=3000` and `PORT=3001`
- **THEN** both serve, each on its own port, against the same database and Redis

#### Scenario: The default is unchanged

- **WHEN** the api starts with `PORT` unset
- **THEN** it listens on 3000, as the Dockerfile and the Vite proxy expect

### Requirement: The api and the worker run as replicas within the pool rule

The app service and the temporal-worker service SHALL each run as one or more replicas, set in the platform, and the
count SHALL respect the pool rule the request-capacity capability states: each process sizes its own pool from the
database's `max_connections` and the pool count, so a replica count change SHALL set `DATABASE_POOL_COUNT` to the new
number of processes that can hold a pool at once, and nothing else. The worker needs no coordination beyond Temporal's
own: each activity is handed to one worker, so a second worker replica is safe as it is. The api holds no per-process
limit or cache: every limit counts in Redis, the section order and the other short-lived caches read through Redis, and
the memory the api keeps is a fallback for a Redis outage alone.

#### Scenario: A second worker scans

- **WHEN** the worker runs as two replicas and the sweep dispatches twenty Scans
- **THEN** each Scan runs on exactly one replica, and the two replicas run up to the sum of their concurrency at once

#### Scenario: A second api serves

- **WHEN** the api runs as two replicas behind the platform's load balancer
- **THEN** a user's requests may reach either, and every limit, count, and session reads the same on both

#### Scenario: A third api replica sets the pool count

- **WHEN** the api's replica count goes from two to three
- **THEN** `DATABASE_POOL_COUNT` goes from 8 to 9, and every process's next start sizes its pool from that

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

### Requirement: The runtime image includes ffmpeg

The root Dockerfile's runtime stage, which the app and the worker share, SHALL install ffmpeg, so the worker can join
and encode a Podcast Episode's audio, and the app can draw a cover, transcode a chat recording, and encode a spoken
reply to MP3 with the `libmp3lame` encoder. The build SHALL fail if ffmpeg cannot be installed.

#### Scenario: The worker finds ffmpeg

- **WHEN** the worker's encode step runs in the deployed image
- **THEN** `ffmpeg` is on the path and encodes the Podcast Episode

#### Scenario: The app finds ffmpeg
- **WHEN** the app transcodes a recording or encodes a spoken answer
- **THEN** ffmpeg runs from the same image, and the reply encodes to MP3

### Requirement: The LiteLLM service alone holds the Gemini key

`GEMINI_API_KEY` SHALL be passed to the LiteLLM service: in `docker-compose.yml` beside `FIREWORKS_API_KEY` for local
development, and in the LiteLLM service's own settings in production. It SHALL be listed in `.env.example`. The app and
the worker SHALL NOT read it, and they SHALL reach Gemini only through the LiteLLM proxy.

#### Scenario: The local proxy has the key

- **WHEN** `bun run carl-up` starts the local services
- **THEN** the LiteLLM container has `GEMINI_API_KEY` in its environment

#### Scenario: The app runs without the key

- **WHEN** the app and the worker start with no `GEMINI_API_KEY` in their environment
- **THEN** they start normally, and a speech request through the proxy still succeeds

### Requirement: The app service exposes a readiness route that renders a page

The app service SHALL respond to `GET /api/health/ready` by rendering the privacy page in-process through the web
server build, with no session lookup, database query, Redis command, or outgoing request. It SHALL respond 200 with a
JSON status body only if that render responds 200 within five seconds and is not marked as rendered without a read it
needs. Otherwise it SHALL respond 503 with a reason. The response SHALL be sent with `Cache-Control: no-store`.

#### Scenario: A server that renders is ready

- **WHEN** the platform requests `/api/health/ready` from a process whose web server build loaded
- **THEN** the privacy page renders, and the route responds 200 with a JSON status body

#### Scenario: A server that cannot render is not ready

- **WHEN** the web server build failed to import, or the privacy page renders with a status other than 200 or without
  a read it needs
- **THEN** the route responds 503 with a reason that names no internal path or error message, while `/api/health`
  still responds 200

#### Scenario: Readiness reads nothing outside the process

- **WHEN** `/api/health/ready` is requested with a session cookie while the database and Redis are unreachable
- **THEN** no session is looked up, no query or command is sent, and the route still responds 200

### Requirement: Readiness requests share one render

Requests to `/api/health/ready` within five seconds of a readiness render's start SHALL receive that render's result,
so the request rate never sets the render rate.

#### Scenario: A flood of readiness requests renders once

- **WHEN** many requests reach `/api/health/ready` within five seconds
- **THEN** the privacy page renders once, and every request receives that render's result

### Requirement: A production api exits if its web server build cannot load

With `NODE_ENV` set to `production`, the api SHALL exit with a non-zero code before it listens, if the web server
build is missing or fails to import. It SHALL first log the error, report it to Sentry, and wait up to two seconds for
the report to send. Outside production, the api SHALL keep serving as the static-serving capability states.

#### Scenario: An undeclared package stops the boot

- **WHEN** the production image starts and the web server build imports a package the install did not link
- **THEN** the process logs the import error, reports it, and exits non-zero without listening on its port

#### Scenario: Development serves without a build

- **WHEN** `bun run dev:api` starts with no `apps/web/dist`
- **THEN** the api listens, and the api routes work

### Requirement: A worker reports a startup failure before it exits

The Temporal worker SHALL report an error that stops it, including one raised before its polling loop starts, to
Sentry and wait up to two seconds for the report to send before it exits with a non-zero code.

#### Scenario: A worker that cannot connect is reported

- **WHEN** the worker starts and cannot connect to Temporal
- **THEN** the error is logged and reported to Sentry, and the process exits non-zero

### Requirement: The platform routes traffic to the app service by readiness

The `app` service's Northflank health checks SHALL be kept in `infra/northflank/app-health-checks.json`: a startup
check on `/api/health` with a grace period of at least three times the measured boot time, a readiness check on
`/api/health/ready`, and a liveness check on `/api/health`. A replica that has not passed readiness SHALL receive no
traffic, so the previous replicas keep serving.

#### Scenario: A broken rollout never serves

- **WHEN** a release starts replicas whose readiness check responds 503
- **THEN** the platform sends them no traffic, and the previous replicas keep serving every request

#### Scenario: A database outage restarts nothing

- **WHEN** the database stops responding while the replicas run
- **THEN** readiness and liveness both keep responding 200, so no replica is restarted or removed from traffic

### Requirement: CI runs the production image before a release

CI SHALL build the production Docker image on every pull request and every push into main. It SHALL start the image
with settings that need no repository secret, against a local Postgres the image's own migrate script prepares, and
request `/`, `/plans`, `/api/health`, and `/api/health/ready`. The job SHALL fail if the container exits or any of
the four responds with a status other than 200.

#### Scenario: A broken web build fails CI

- **WHEN** a pull request's web server build imports a package that `apps/web` does not declare
- **THEN** the image smoke job fails, naming the failed build step or the container's exit and its log

#### Scenario: A healthy build passes

- **WHEN** the image builds and starts
- **THEN** the home page, the plans page, liveness, and readiness each respond 200, and the job passes

### Requirement: A release deploys only a commit that CI passed

The `release-main` release flow SHALL have no git push trigger. A CI job SHALL start it through the Northflank API on
a push to main, only after the gate and the image smoke job pass, and the run SHALL build the commit that CI tested. A
run started by hand in the Northflank console SHALL remain possible.

#### Scenario: A failed gate deploys nothing

- **WHEN** a push to main fails the image smoke job
- **THEN** no release run starts, and the deployed replicas keep serving the previous build

#### Scenario: A later push does not change what deploys

- **WHEN** CI passes commit A while commit B has already reached main
- **THEN** the release run started for A builds and deploys A

### Requirement: The release waits for readiness before its next step

The `release-main` deploy step for `app` SHALL complete only after the new replicas pass readiness. A rollout whose
replicas never become ready SHALL fail the run before the edge purge, the worker deploy, and the docs sync.

#### Scenario: An unready rollout stops the run

- **WHEN** the new `app` replicas never pass readiness
- **THEN** the run fails at the deploy step, and the edge is not purged

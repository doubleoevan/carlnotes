## ADDED Requirements

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

## REMOVED Requirements

### Requirement: An external monitor polls the liveness route

**Reason**: The monitor polling `/api/health` stayed green through a full hour of 503 pages, because liveness only
proves the process runs.

**Migration**: The monitoring-analytics capability's uptime monitor requirement now covers the external monitor: it
polls `/api/health/ready`, and a second monitor watches the home page.

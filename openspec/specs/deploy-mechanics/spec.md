# deploy-mechanics Specification

## Purpose
TBD - created by archiving change add-deploy-health-and-migrations. Update Purpose after archive.

## Requirements

### Requirement: The app service exposes a liveness route

The app service and the web service SHALL each answer `GET /api/health` on their own port with 200 and a JSON body
reporting that the process is up and naming the process that answered, `api` or `web`, so a request on the public domain
shows which service a path route reached. The route SHALL NOT query the database, and SHALL NOT require or resolve a
session, so that an unreachable database never presents as a dead instance. Northflank's health check reaches each
service by its port, so the web service answers the route on its own port whatever path routing sends `/api` to on the
public domain.

#### Scenario: A healthy process answers

- **WHEN** the platform requests `/api/health`
- **THEN** the app answers 200 with a JSON status body

#### Scenario: An unreachable database does not fail the check

- **WHEN** the process is running but no database connection can be made
- **THEN** `/api/health` still answers 200, so the platform leaves the instance alone rather than restarting it

#### Scenario: The web service answers its own check

- **WHEN** the platform requests `/api/health` on the web service's port
- **THEN** the web service answers 200 itself, with no request to the app service

#### Scenario: The body names the service that answered

- **WHEN** an operator requests `/api/health` on the public domain after the path routes are added
- **THEN** the body names the process `api`, because the `/api` prefix routes to the app service

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

The app service and the web service SHALL each respond to `GET /api/health/deep` by running one trivial query with a
two-second limit. When the query succeeds, it SHALL respond 200 with a JSON body of the status, the query's latency in
milliseconds, and the connection pool's `totalCount`, `idleCount`, and `waitingCount`. When the query fails or runs
past the limit, it SHALL respond 503 with the status and the pool counts. The route SHALL NOT require or resolve a
session, SHALL be sent with `Cache-Control: no-store`, and SHALL NOT be traced. The liveness route `/api/health` SHALL
stay query-free, since the platform restarts the container on it, and a database outage SHALL NOT change its response.

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

### Requirement: The app listens on the configured port

The app service SHALL listen on the port the `PORT` environment variable names, and on 3000 if it is unset, so two api processes can run side by side on one machine and the platform can place a replica on the port it chooses. The server's export SHALL omit a fixed port and let Bun read the variable, and the Dockerfile SHALL keep exposing 3000 as the default.

#### Scenario: Two api processes on one machine

- **WHEN** a developer starts the api twice with `PORT=3000` and `PORT=3001`
- **THEN** both serve, each on its own port, against the same database and Redis

#### Scenario: The default is unchanged

- **WHEN** the api starts with `PORT` unset
- **THEN** it listens on 3000, as the Dockerfile and the Vite proxy expect

### Requirement: The api and the worker run as replicas within the pool rule

The app service, the web service, the temporal-worker service, and the film service SHALL each run as one or more
replicas, set in the platform, and the count SHALL respect the pool rule the request-capacity capability states: each
process sizes its own pool from the database's `max_connections`, the pool count, and its own pool shares, so a
replica count change SHALL set `DATABASE_POOL_COUNT` to the new sum of the pool shares of the processes that can hold
a pool at once, counting every service at its autoscaling maximum, and nothing else. The worker needs no coordination
beyond Temporal's own: each activity is handed to one worker, so a second worker replica is safe as it is. The api and
the web service hold no per-process limit or cache: every limit counts in Redis, the section order and the other
short-lived caches read through Redis, and the memory a process keeps is a fallback for a Redis outage alone.

#### Scenario: A second worker scans

- **WHEN** the worker runs as two replicas and the sweep dispatches twenty Scans
- **THEN** each Scan runs on exactly one replica, and the two replicas run up to the sum of their concurrency at once

#### Scenario: A second api serves

- **WHEN** the api runs as two replicas behind the platform's load balancer
- **THEN** a user's requests may reach either, and every limit, count, and session reads the same on both

#### Scenario: A third api replica sets the pool count

- **WHEN** the api's replica count goes from two to three, with every other count at the default
- **THEN** `DATABASE_POOL_COUNT` goes from 14 to 15, and every process's next start sizes its pool from that

#### Scenario: The web service counts in the pool

- **WHEN** the web service runs as two replicas beside two api replicas
- **THEN** the pool count holds one pool share for each of the four, beside the workers, their rolling overlap, the
  sweep, and the reset

#### Scenario: A third main worker replica adds two pool shares

- **WHEN** the main worker's replica count goes from two to three, with every other count at the default
- **THEN** `DATABASE_POOL_COUNT` goes from 14 to 16, because a main worker takes two pool shares

### Requirement: The budget reset runs as its own scheduled job

The monthly budget reset SHALL run as its own script, `bun run reset:monthly-budgets`, on a platform cron once a day
shortly after midnight UTC, under its own database lease, the same kind the sweep uses, so an overlapping reset exits
without doing the work. It SHALL NOT run inside the scheduled sweep. The README's process table SHALL name the job
beside the scheduler. Every other process Northflank starts, the Temporal worker, the sweep, the migrate, edge purge,
and docs embed jobs, SHALL likewise start through a root script, as the workspace-structure capability states.

#### Scenario: The reset runs apart from the sweep

- **WHEN** the reset job and a sweep run in the same minute
- **THEN** the sweep dispatches its Scans without waiting for a single key to be replaced, and the reset replaces keys
  without a sweep in its process

#### Scenario: A second reset exits

- **WHEN** a reset starts while another reset holds the lease
- **THEN** the second exits at once having replaced nothing

### Requirement: The runtime image includes ffmpeg

The root Dockerfile's runtime stage, which the app service, the web service, the worker, and the film service share,
SHALL install ffmpeg, so the worker can join and encode a Podcast Episode's audio, and the app can draw a cover,
transcode a chat recording, and encode a spoken reply to MP3 with the `libmp3lame` encoder. The build SHALL fail if
ffmpeg cannot be installed.

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

The app service and the web service SHALL each respond to `GET /api/health/ready` by rendering the privacy page
in-process through the web server build, with no session lookup, database query, Redis command, or outgoing request.
It SHALL respond 200 with a JSON status body only if that render responds 200 within five seconds and is not marked as
rendered without a read it needs. Otherwise it SHALL respond 503 with a reason. A process that is draining after
SIGTERM SHALL respond 503 without rendering, as the drain requirement states. The response SHALL be sent with
`Cache-Control: no-store`.

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

#### Scenario: The web service is ready while the app service is down

- **WHEN** the platform requests `/api/health/ready` on the web service's port while no `app` replica is running
- **THEN** the web service responds 200, because the privacy page reads nothing from any api

#### Scenario: A draining replica is not ready

- **WHEN** the platform requests `/api/health/ready` from a replica that has received SIGTERM
- **THEN** the route responds 503, and the platform sends the replica no new request

### Requirement: Readiness requests share one render

Requests to `/api/health/ready` within five seconds of a readiness render's start SHALL receive that render's result,
so the request rate never sets the render rate. A draining process is the exception: it SHALL respond 503 at once, as
the readiness route's requirement states.

#### Scenario: A flood of readiness requests renders once

- **WHEN** many requests reach `/api/health/ready` within five seconds
- **THEN** the privacy page renders once, and every request receives that render's result

### Requirement: A production api exits if its web server build cannot load

With `NODE_ENV` set to `production`, the api SHALL exit with a non-zero code before it listens, if the web server
build is missing or fails to import, whether it starts as the `app` service or as the `web` service. It SHALL first
log the error, report it to Sentry, and wait up to two seconds for the report to send. Outside production, the api
SHALL keep serving as the static-serving capability states.

#### Scenario: An undeclared package stops the boot

- **WHEN** the production image starts and the web server build imports a package the install did not link
- **THEN** the process logs the import error, reports it, and exits non-zero without listening on its port

#### Scenario: Development serves without a build

- **WHEN** `bun run dev:api` starts with no `apps/web/dist`
- **THEN** the api listens, and the api routes work

#### Scenario: The web service stops the same way

- **WHEN** the production image starts with `bun run web` and the web server build fails to import
- **THEN** the process logs the import error, reports it, and exits non-zero without listening on its port

### Requirement: A worker reports a startup failure before it exits

The Temporal worker SHALL report an error that stops it, including one raised before its polling loop starts, to
Sentry and wait up to two seconds for the report to send before it exits with a non-zero code.

#### Scenario: A worker that cannot connect is reported

- **WHEN** the worker starts and cannot connect to Temporal
- **THEN** the error is logged and reported to Sentry, and the process exits non-zero

### Requirement: The platform routes traffic to the app service by readiness

The `app` service's and the `web` service's Northflank health checks SHALL be the one set kept in
`infra/northflank/app-health-checks.json`: a startup check on `/api/health` with a grace period of at least three
times the measured boot time, a readiness check on `/api/health/ready`, and a liveness check on `/api/health`. A
replica of either service that has not passed readiness SHALL receive no traffic, so the previous replicas keep
serving.

#### Scenario: A broken rollout never serves

- **WHEN** a release starts replicas whose readiness check responds 503
- **THEN** the platform sends them no traffic, and the previous replicas keep serving every request

#### Scenario: A database outage restarts nothing

- **WHEN** the database stops responding while the replicas run
- **THEN** readiness and liveness both keep responding 200, so no replica is restarted or removed from traffic

#### Scenario: The web service runs the same checks

- **WHEN** the `web` service is created in Northflank
- **THEN** its startup, readiness, and liveness checks are the ones in `infra/northflank/app-health-checks.json`

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

### Requirement: The release waits for readiness before its next step

The `release-main` deploy steps for `app` and for `web` SHALL each complete only after the new replicas pass
readiness. A rollout whose replicas never become ready SHALL fail the run before every later step: the `web` deploy
for an `app` rollout, then the edge purge, the worker deploy, the film service deploy, and the docs sync.

#### Scenario: An unready rollout stops the run

- **WHEN** the new `app` replicas never pass readiness
- **THEN** the run fails at the deploy step, and the edge is not purged

#### Scenario: An unready web rollout stops the run

- **WHEN** the new `web` replicas never pass readiness
- **THEN** the run fails at the `web` deploy step, the edge is not purged, and neither the worker nor the film service
  is deployed

### Requirement: A push to main starts the release

The `release-main` release flow SHALL have a GitHub push trigger on `main`, and each run SHALL build the newest commit
on `main`. No CI job SHALL start or hold back the release. A run started by hand in the Northflank console SHALL remain
possible.

#### Scenario: A push releases without waiting for CI

- **WHEN** a commit reaches main
- **THEN** a release run starts at once and deploys that commit, whatever CI's result

#### Scenario: A hand-started run deploys main

- **WHEN** someone runs `release-main` from the Northflank console
- **THEN** the run builds and deploys the newest commit on `main`

### Requirement: A migration that drops or renames says the previous release no longer reads it

A test SHALL fail a migration added from this change on that holds `DROP COLUMN`, `DROP TABLE`, or `RENAME` unless its
first comment says the previous release no longer reads what it removes, so a service rolled back one release still
runs against the schema. A column or a table SHALL be added in one release and removed in a later one.

#### Scenario: A rename with no comment fails the test

- **WHEN** a new migration renames a column and its first comment says nothing about the previous release
- **THEN** the test fails naming the migration

#### Scenario: A commented drop passes

- **WHEN** a new migration drops a column and its first comment says the previous release no longer reads it
- **THEN** the test passes

#### Scenario: The repository's migrations pass

- **WHEN** the test runs over the repository at this change
- **THEN** it passes

### Requirement: The public domain reaches the web service and the app service by path

The public domain SHALL reach the two services through Northflank path routing. The base path SHALL route to the `web`
service. The prefixes `/api`, `/mcp`, and the two oauth well-known paths SHALL route to the `app` service. Routes of a
higher priority SHALL send the public file paths after `/api` to the `web` service: the preview images, the podcast
covers, the favicons, the avatars, and the stored images. No path changes, so every Cloudflare cache rule SHALL keep
its meaning.

#### Scenario: A page comes from the web service and a browser's api read from the app service

- **WHEN** a signed-in user's browser loads a topic page and then reads `/api/topics/<id>`
- **THEN** the `web` service serves the page and its client files, and the `app` service answers the `/api` read

#### Scenario: Documents, feeds, and the docs reach the web service

- **WHEN** a request arrives for the sitemap, a feed, an llms file, a blog or release page, a path after `/docs/`, or
  a path after `/nightshift/`
- **THEN** the base path route sends it to the `web` service

#### Scenario: Preview images, covers, favicons, and avatars reach the web service

- **WHEN** a request arrives for a `preview.png` of a Topic, a profile, a Team, an invite, a Podcast Episode, or a
  Topic Post, or for a path after `/api/podcast-covers`, `/api/favicons`, `/api/avatars`, or `/api/team-avatars`
- **THEN** a higher-priority route sends it to the `web` service

#### Scenario: Stored images reach the web service

- **WHEN** a request arrives for a path after `/api/topic-images`, `/api/podcast-episode-images`,
  `/api/topic-podcast-episode-video-images`, `/api/topic-post-images`, or `/api/topic-post-body-images`
- **THEN** a higher-priority route sends it to the `web` service, so no image streams through the process that holds
  the chat streams

#### Scenario: The MCP server and every stream stay on the app service

- **WHEN** a client connects to `/mcp`, reads `/.well-known/oauth-authorization-server` or
  `/.well-known/oauth-protected-resource`, or opens a chat stream or a room stream
- **THEN** the `app` service answers

#### Scenario: A counted hop stays on the app service

- **WHEN** a podcast app requests a file after `/api/podcast-feeds`, or a browser posts a view or requests the audio
  or the film of a Podcast Episode
- **THEN** the `app` service answers and counts the play or the view with its place, as it does today

### Requirement: The public readiness check watches the service that renders pages

An exact route SHALL send `/api/health/ready` on the public domain to the `web` service, so the external monitor
watches the service that renders pages. The platform's own probes SHALL keep reaching each service by its port,
whatever the public routes say.

#### Scenario: The external monitor reaches the web service

- **WHEN** the external monitor requests `/api/health/ready` on the public domain
- **THEN** the `web` service answers with its own readiness render, although the `/api` prefix routes to `app`

#### Scenario: The platform still probes the app service

- **WHEN** the platform requests `/api/health/ready` on the `app` service's port
- **THEN** the `app` service answers with its own readiness render

### Requirement: Rolling back the web service is a routing change

The `app` service SHALL keep serving every path the `web` service serves. Rolling back SHALL be pointing the base path
back at the `app` service and removing the other routes, with no deploy.

#### Scenario: Rolling back is a routing change

- **WHEN** the base path is pointed back at the `app` service and the other routes are removed
- **THEN** every path responds from the `app` service as it did before the routes existed, with no deploy

#### Scenario: A path routed to the other service still gets its response

- **WHEN** a path the routes meant for one service reaches the other
- **THEN** it gets the response the first would have sent

### Requirement: The web service starts with no api origin set

The `web` service SHALL start with `API_ORIGIN` unset, so its page renders read the api of their own process, as the
ui-routing capability states. A value for `API_ORIGIN` SHALL be set only in the `web` service's own Northflank
variables and never in Doppler, where the `app` service would read it too and call itself over the network.

#### Scenario: A render does not wait on the app service

- **WHEN** the `app` service rolls out while the `web` service renders a public page
- **THEN** the render reads the `web` process's own api and is not cut by the rollout

#### Scenario: A release never renders against another build's api

- **WHEN** a release has deployed the new `app` replicas and the previous `web` replicas still serve
- **THEN** each page render reads the api of its own build, so a changed response contract fails no render

#### Scenario: An origin set for a trial stays on the web service

- **WHEN** an operator sets `API_ORIGIN` to try renders that read the `app` service
- **THEN** the value is in the `web` service's own variables, and the `app` service starts with none

### Requirement: The release deploys the web service after the app service and the film service beside the worker

The `release-main` workflow SHALL deploy every service from the one build it made. It SHALL deploy the `web` service
right after the `app` service and before the edge purge, and the film service beside the worker's deploy, after the
purge and before the docs sync.

#### Scenario: A release runs its steps in order

- **WHEN** a release runs
- **THEN** it builds the image, runs the migration, deploys `app`, deploys `web`, purges the edge, deploys the worker
  and the film service, and embeds the docs, each from the same build

#### Scenario: The purge follows the web service

- **WHEN** the release reaches the edge purge
- **THEN** the new `web` replicas have passed readiness, so the edge refills from the new build's pages

### Requirement: The api drains before it stops

On SIGTERM the api, started as the `app` or the `web` service, SHALL drain before it exits. Its readiness route SHALL
respond 503 at once, and it SHALL keep answering for 5 seconds in production, so the platform stops routing to it
before it stops listening. Its event streams SHALL then end, so each client reconnects to another replica, and the
requests in progress SHALL finish. It SHALL flush its monitoring, analytics, and telemetry before it exits.

#### Scenario: A request in progress at a deploy completes

- **WHEN** a replica receives SIGTERM while an upload or a signup request is in progress
- **THEN** the request gets its normal response before the process exits

#### Scenario: A reply being streamed finishes

- **WHEN** a replica receives SIGTERM while it streams a chat reply that ends inside the drain limit
- **THEN** the reply streams to its end before the process exits

#### Scenario: An open room stream reconnects elsewhere

- **WHEN** a replica receives SIGTERM while a room's event stream is open on it
- **THEN** the stream ends, and the client's reconnect reaches a replica that is still ready

#### Scenario: Buffered events are sent

- **WHEN** a draining process holds analytics events, telemetry spans, or error reports it has not sent
- **THEN** it sends them before it exits

### Requirement: A drain has a limit

A draining api SHALL wait for its requests in progress no longer than `API_DRAIN_LIMIT_MS`, 120 seconds by default, and
SHALL then close the ones still open, flush, and exit, so the drain ends inside the platform's termination grace
and the flush is never lost to a kill. The flush SHALL run no longer than 10 seconds, and the drain's timers SHALL NOT
keep the process alive once their wait is over.

#### Scenario: A request that outlasts the limit is closed

- **GIVEN** a drain limit of 120 seconds
- **WHEN** a request is still in progress 120 seconds after the replica stopped listening
- **THEN** the request is closed, the buffered events are sent, and the process exits

#### Scenario: A flush that never finishes still lets the process exit

- **GIVEN** a replica whose database pool is still opening a connection, so the pool never finishes ending
- **WHEN** the replica drains with no request in progress
- **THEN** the process exits 10 seconds after the flush started, not at the drain limit

### Requirement: The worker runs as a main queue group and a films queue group

The worker SHALL read the setting `WORKER_QUEUE_GROUP`. With `films` it SHALL host the Workers that render, rebuild, and
backfill films, and no other. With `main` it SHALL host every other Worker, the Worker of the films' short writes among
them. With no queue group it SHALL host every Worker, as it does in development. Production SHALL run the `films` queue
group as a film service of its own, so a film encode never shares a process with a Scan.

#### Scenario: A film replica renders films alone

- **WHEN** a worker starts with `WORKER_QUEUE_GROUP` set to `films`
- **THEN** it polls the film queues and no scan, recording, or email queue

#### Scenario: A main worker renders no film

- **WHEN** a worker starts with `WORKER_QUEUE_GROUP` set to `main`
- **THEN** it hosts no film Worker, so no film renders or rebuilds in its process, and it writes each queued film's row
  and each failed film's mark

#### Scenario: No queue group hosts every Worker

- **WHEN** a worker starts with `WORKER_QUEUE_GROUP` unset
- **THEN** it hosts every Worker, so development and a deploy that has not created the film service yet run as before

#### Scenario: A film replica that runs out of memory ends films alone

- **WHEN** the platform kills a film replica while it encodes
- **THEN** no Scan, recording, or email activity is interrupted

### Requirement: The web service runs two to four replicas that scale on cpu

The `web` service SHALL run at least two replicas and at most four, scaling on cpu at 70 percent, the shape the `app`
service has.

#### Scenario: A burst of renders adds a web replica

- **WHEN** the `web` replicas' cpu stays above 70 percent
- **THEN** the platform adds a replica, up to four

#### Scenario: A quiet hour keeps two

- **WHEN** the `web` replicas are idle
- **THEN** two replicas keep running, so a rollout or a lost node never leaves the base path without a replica

### Requirement: The film service and the main worker scale on their demand gauges

The film service SHALL scale from one to four replicas on the film demand gauge, with the threshold at one film
replica's slots. The `temporal-worker` service, which runs the `main` queue group, SHALL scale from two to four replicas
on the scan demand gauge. Both gauges are the ones the worker serves at its Prometheus endpoint, as the
performance-telemetry capability states. If the platform's plan has no custom metric autoscaling, both services SHALL
scale on cpu at 70 percent instead.

#### Scenario: A film backlog adds film replicas

- **WHEN** more films wait in the film queue than the running film replicas have slots for
- **THEN** the film service scales out, up to four replicas, and no other service changes

#### Scenario: An idle film service runs one replica

- **WHEN** no film renders and the film queue is empty
- **THEN** the film service runs one replica

#### Scenario: A scan backlog adds main workers

- **WHEN** first Scans queue faster than two main workers finish them
- **THEN** the `temporal-worker` service scales out, up to four replicas

#### Scenario: A plan without custom metrics scales on cpu

- **WHEN** the platform's plan cannot scale on a custom metric
- **THEN** the film service and the `temporal-worker` service each scale on cpu at 70 percent within the same ranges

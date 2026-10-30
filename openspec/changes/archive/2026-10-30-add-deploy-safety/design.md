## Context

See proposal.md, Why. Current state that shapes the approach:

- `apps/api/index.ts` imports the web server build once before serving (`importUiServer`). A missing build becomes 404
  pages and a failed import becomes 503 pages. The failed import is already logged and passed to `reportError` in the
  `page-render` stage.
- The web server build bundles the `@carlnotes` workspace packages but leaves their third-party imports external, so
  each one must resolve from `apps/web/dist/server` in the production install. That install links only the packages
  `apps/web` declares. `zod` came in through `packages/contracts`, so no source file in `apps/web` imports it directly.
- `scripts/importBoundaries.ts` already parses every import and fails on an undeclared `@carlnotes` package. It skips
  third-party packages.
- SSR reads page data from `http://localhost:3000` (`apps/web/src/lib/webApiClient.ts`), so the home page needs a
  working database to render 200. `packages/db` uses the Neon serverless driver, which talks WebSockets, not the plain
  Postgres protocol.
- `infra/northflank/release-main.json` is the only Northflank config in the repo, and the owner applies it by hand. It
  starts on a git push trigger, deploys `app` once the container is `running`, and builds whatever `main` points to.
  The `app` service's health checks live only in the Northflank console.
- `Sentry.init` sets no `release`.
- The Temporal worker's `run().catch` logs and exits without reporting, so a failure before the polling loop starts
  never reaches Sentry.

## Goals / Non-Goals

**Goals:**

- Each layer catches the incident on its own: the boundary check, the image build, the image smoke job, the boot, the
  readiness probe, and the monitors.
- No new secret is needed to run CI on a pull request.

**Non-Goals:**

- Seeding a topic for the image smoke job. The incident broke every page, and the home page and plans page exercise
  the same SSR path and its shared chunks.
- Changing `smoke.yml`, which stays post-merge and secret-backed.
- Probing the worker. It serves no HTTP, and its startup failure now reports instead.
- Health checks for the `web` service in `split-web-from-api`. That change reuses the readiness route when it applies.

## Decisions

**Extend the existing boundary check instead of adding a script.** The two source rules are added to
`scripts/importBoundaries.ts` and `scripts/packageBoundaries.ts`: declare every third-party import, and import no
dev-only dependency at runtime. Both files already parse imports and read each workspace's declarations, so preflight
gains no new step. The web closure rule also goes in `packageBoundaries.ts`. It walks `apps/web`'s `@carlnotes`
dependencies and collects the third-party packages their runtime files import, and `apps/web` must declare each one.
This catches the `zod` case from source alone, with no build. Alternative considered: bundle every dependency with
Vite's `ssr.noExternal`. That was rejected because the repo declares runtime dependencies and the user prefers that
pattern.

**Scan the built output inside the Docker build.** A new `scripts/check-built-dependencies.ts` reuses
`toParsedImports` over `apps/web/dist/server/**/*.js` and runs as a `RUN` step right after `build:ui`. The image build
fails before it can be pushed, on CI and on Northflank alike. The script started out as the incident's one-off boot
check, which also printed the 21 declared packages it found. Its import-scan half moves into the repo, and its boot half
becomes the readiness route. Alternative considered: running
the scan in preflight. That was rejected because preflight does not build the ui, and a stale local `dist` would pass
or fail for the wrong reasons.

**Fail fast only under `NODE_ENV=production`.** The Dockerfile already sets `NODE_ENV`, and local development needs the
api without a build (static-serving). At boot, a `missing` or `failed` import result in production calls
`exitOnFatalError` from `packages/server/monitoring.ts`, which logs, calls `reportError(error, "startup")`, waits on
`shutdownMonitoring()` (two seconds), and calls `process.exit(1)`. The exit happens at top-level `await`, before Bun
reads the default export, so the port never opens. `startup` and `worker` are added to `reportedStages`. The
per-request `failed` branch stays for development.

Startup audit, with the decision for each finding. The test is the same for every row: a broken build is fatal, and an
outside outage is not.

| Site | Today | Decision |
| --- | --- | --- |
| `importUiServer` at boot | logs, serves 503 | fatal in production |
| `sizeConnectionPool` | logs, keeps the default size | unchanged: a database outage must not stop a boot |
| `checkTrustedProxies` | warns once | unchanged: a warning, not a broken build |
| docs `dist` missing | 404 for `/docs` | unchanged: the image's `COPY --from=build` already fails without it |
| api `checkDatabaseHealth` catch | logs, responds 503 | unchanged: a database outage, which the deep health check reports |
| api `reportRouteError` | reports in `api-route`, responds 500 | unchanged: one route's failure, already reported |
| worker `run().catch` | logs, exits | `exitOnFatalError`: reported under `startup` before polling and `worker` after |
| worker `worker.shutdown()` catch | ignored | unchanged: a worker that already stopped throws, and the race reports the cause |
| `schedule.ts` cron run | uncaught, exits non-zero | unchanged: the cron run shows as failed in Northflank |
| `schedule.ts` interval loop catch | logs | unchanged: only `dev:worker` sets `SCHEDULE_INTERVAL_MS` |
| `resetMonthlyBudgets.ts` catch | reports in `billing`, exits 1 | unchanged: already reports and flushes |
| `docsSync.ts` | uncaught, exits non-zero | unchanged: the release's docs sync step shows as failed |

**Readiness renders `/privacy` in-process.** The route builds `new Request("http://localhost/privacy")` with no cookie
and calls the loaded `uiServer.fetch` under `withTimeLimit` (five seconds). It skips the page guards, so the render
limit's busy 503 never removes a replica from traffic. `/privacy` has no loader, and its head is static
(`toStaticHeadTags`). A render marked with the degraded render header is not ready either, since a visitor would get a
503 for it. Every check within five seconds of a render's start reuses that render's result, so a flood of public
requests to the route renders at most once every five seconds. A render that times out has its page cancelled when it
finishes, and a render that throws is logged and reported, with a fixed reason in the response. A unit test replaces
`globalThis.fetch` and the database pool with versions that throw, and asserts a 200 from the real server build, which
enforces "reads nothing outside the process". That test runs where `build:ui`
has written the build, and the image smoke job checks readiness on the built image. Swapping `/privacy` for `/` makes
the test fail, because the home page's reads fail and mark it degraded. Alternatives considered: (a) reporting the
import status alone. That was rejected because a build that imports but throws on render, such as a missing chunk,
would pass. (b) Rendering the home page. That was rejected because it reads the database, so an outage would pull
every replica out of traffic. The route is registered beside `/api/health`, ahead of the session lookup and the
version gate. It is also added to the health-check paths that `toTracesSampleRate` samples at zero, which the existing
requirement's "health checks" already covers.

**Report 5xx renders.** `toRenderedPageResponse` reports a non-degraded page with `status >= 500` in the
`page-render` stage, with its path. Today only a thrown render and a degraded render reach Sentry. TanStack Start
catches a route error and returns a 500 itself, so neither path saw those pages.

**The image smoke job runs against Postgres through Neon's WebSocket proxy.** `packages/db` reads an optional
`DATABASE_WS_PROXY`. When it is set, the module sets `neonConfig.wsProxy`, turns off `useSecureWebSocket`, and turns
off `pipelineTLS` and `pipelineConnect`. Production never sets it. The steps live in `scripts/image-smoke.sh`, which
the job runs and `bun run smoke:image <image>` runs locally. It runs three containers on one Docker network:
`pgvector/pgvector:pg17`, since the migrations create the `vector` extension, Neon's `wsproxy` image, both pinned by
digest per supply-chain, and the built image. The built image first runs `bun packages/db/migrate.ts`, the entry
`db:migrate` runs under Doppler, which also proves the migrate job resolves its packages in the image. Then it starts
with `bun apps/api/index.ts`, overriding the `doppler run` CMD, and with only the dummy settings the script lists.
With `DOPPLER_ENVIRONMENT` unset, Sentry stays off, and with no `REDIS_URL` the memory fallback runs. The script polls
`/api/health` for up to 90 seconds and prints the boot time, which sets the startup grace. Then it requests the four
paths. On failure it prints `docker logs`. The build uses `docker/build-push-action` with the GHA
layer cache and Cloudflare's public always-pass Turnstile key, `1x00000000000000000000AA`. Alternatives considered:
(a) a Neon branch behind a secret. That was rejected because it is not offline and gives a fork's pull request no
secret. (b) Swapping the driver to `pg` locally. The repo bans it. (c) Accepting a 503 home page. The user requires
200.

**CI starts the release, with the commit it tested.** A `release` job in `ci.yml` has
`needs: [gate, image-smoke]` and runs only for `push` to `refs/heads/main`. It calls the Northflank API to start
`release-main` with the argument `sha: ${{ github.sha }}`. In `release-main.json`, the `triggers` array goes, and the
build step builds `${args.sha}` instead of the branch head. The job sends
`POST /v1/projects/carlnotes-prd/pipelines/{pipeline}/release-flows/{stage}/runs` with
`{"arguments": {"sha": ...}}`, reading the pipeline and stage from the `NORTHFLANK_PIPELINE_ID` and
`NORTHFLANK_RELEASE_STAGE` repository variables, and skips while the pipeline variable is unset. No official GitHub
Action starts a release flow, so the job uses `curl --fail-with-body`. The token is `NORTHFLANK_API_TOKEN`, scoped to
running release flows in `carlnotes-prd`. It is a secret of the `production` GitHub environment, whose deployment
branch rule allows only `main`, so a pull request from a branch of this repository cannot read it. `mobile-export` is
not a dependency, because the mobile app is not in the image. The existing `cancel-in-progress` on main means a newer
push may cancel an older commit's run before its release starts. The newer commit then deploys after its own CI,
which is the intended result. Alternative considered:
keeping the git trigger and relying on readiness alone. Then a broken image still migrates the database and runs the
edge purge.

**The deploy steps wait with a time limit.** Northflank documents one condition for a Release node, `running`, and a
node-level `timeoutDuration` in seconds that fails the node, and so the run, once it passes. `deploy-app` and
`deploy-worker` keep `running` and set `timeoutDuration: 600`. With the readiness probe on `app`, the rolling deploy
starts the new replicas before it stops the old ones, and a replica that fails readiness takes no traffic, so the old
replicas keep serving. A rollout that never runs fails the run before the edge purge, the worker deploy, and the docs
sync. Alternative considered: `success`, which Northflank documents for Build and JobRun nodes but not for a Release
node, so its behavior there is unknown.

**Probes live in `infra/northflank/app-health-checks.json`.** The file holds the `healthChecks` body for the `app`
service. The owner applies it the same way as `release-main.json`, with the Northflank CLI or console. Values:

- Startup: `/api/health` every 10 s, Northflank's shortest period, failing after 12 misses, so a boot has two minutes.
  The api boots in seconds, so the grace is many times the boot time.
- Readiness: `/api/health/ready` every 10 s, failing after 3 misses and timing out at 6 s.
- Liveness: `/api/health` every 10 s, failing after 6 misses.

**The release tag comes from the deployed commit.** `startMonitoring` passes `release` from `SENTRY_RELEASE`, falling
back to `NF_DEPLOYMENT_SHA`, the commit SHA that Northflank sets in a running container of a git build. Its
`NF_GIT_SHA` is a build argument only and never reaches the runtime, so no Dockerfile change is needed. The worker
shares the same init.

**Docs go in the README.** There is no `ARCHITECTURE.md` and no build-process doc in the repo. The Architecture section
gets a short "Deploy safety" subsection that lists the layers. The Development section's deploy text describes the
CI-started release, the probes, the image smoke job, and the manual alert steps, with email and Sentry mobile push as
the destination.

## Risks / Trade-offs

- [A broken `main` can no longer deploy a hotfix past CI] → A manual run from the Northflank console still deploys
  any build. The README names that path, and the incident's `--no-verify` push becomes a console run.
- [The image build adds minutes to every pull request] → The GHA layer cache reuses the install layers. The job runs
  in parallel with `gate` and `mobile-export`.
- [Neon's proxy behaves differently from Neon in production] → The smoke job checks that renders resolve, not query
  behavior, and `smoke.yml` still runs against a real Neon branch after merge.
- [`/privacy` gains a loader one day, and readiness starts reading the database] → The readiness unit test fails on
  any outgoing fetch or pool query.
- [The union rule over-declares packages in `apps/web` that the SSR build never reaches] → An extra declared runtime
  package costs a few MB in the image and never breaks a page. Under-declaring broke production.
- [Sentry may have dropped the incident's `page-render` reports for a reason this change does not fix] → A task
  checks Sentry for `page-render` events between the 4752b07 and 7e2f51d0 deploys. If they arrived, the gap was the
  missing alert rule, which the alert steps fix. If none arrived, the cause is found and fixed before the change
  archives.
- [The release flow change goes out of step with the CI job] → See the migration plan for the order.

## Migration Plan

1. Push the change. The old git trigger deploys it, so the fail-fast boot and the readiness route are live before any
   probe points at them. The `release` job skips, because `NORTHFLANK_PIPELINE_ID` is not set yet.
2. Apply the new `release-main.json` in Northflank, which removes the trigger and adds the `sha` argument.
3. Create the `production` environment with a deployment branch rule for `main` only, add `NORTHFLANK_API_TOKEN` as
   its secret, and add the `NORTHFLANK_PIPELINE_ID` and `NORTHFLANK_RELEASE_STAGE` repository variables, the
   pipeline's id and the stage that holds `release-main`. The next push to main deploys only through CI.
4. Apply `app-health-checks.json`, using the boot time from the image smoke job's log.
5. Point the external monitor at `/api/health/ready`, then create the two Sentry alerts and the Sentry uptime monitor,
   each notifying by email and mobile push.
6. Rollback: restore the git trigger in the Northflank console and remove the probes. The code changes are safe to
   leave in place, because they only exit on a build that cannot serve pages.

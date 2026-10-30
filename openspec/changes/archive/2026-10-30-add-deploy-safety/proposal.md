## Why

On 2026-10-29, commit 4752b07 shipped a web server build that imports `zod`, which `apps/web/package.json` did not
declare, so the production image's install left it unresolvable. Every page responded 503 for about an hour while
`/api/health` responded 200, Northflank reported the deploy healthy, and the external monitor stayed green. The `zod`
declaration shipped on its own in 7e2f51d0. This change closes each gap that let a broken build deploy and then go
unnoticed: no check caught the undeclared package, the api kept serving with no pages, no route proved a page renders,
CI never ran the production image, and the deploy did not wait for CI.

## What Changes

- **Declared dependencies.** The package boundary check fails on a third-party import that the importing workspace
  does not declare, and on a runtime file that imports a package declared only as a development dependency. `apps/web`
  must also declare the runtime dependencies of the universal packages its server build bundles, since Vite leaves
  their imports external. A second check scans the built web server output inside the Docker build, so an undeclared
  external fails the image build itself, in CI and on Northflank alike.
- **Fail fast at startup.** In production, an api whose web server build is missing or fails to import reports the
  error to Sentry, waits for the report to send, and exits non-zero instead of serving 503 pages. Local development
  keeps today's behavior, where the api serves with no build. A worker that fails before its polling loop starts
  reports the failure to Sentry before it exits.
- **Readiness.** A new `GET /api/health/ready` route renders the static privacy page in-process through the web server
  build, with no database, session, Redis, or vendor call, and responds 200 only if that page renders 200.
  `/api/health` stays the database-free liveness route.
- **Northflank health checks.** `infra/northflank/app-health-checks.json` holds the `app` service's startup, readiness,
  and liveness probes. A pod that fails readiness never receives traffic, so the previous pods keep serving. The
  startup probe's grace period comes from the measured boot time, with headroom.
- **CI gates the release.** A new image smoke job builds the production Docker image on every pull request and push
  into main. It starts the image against an offline Postgres, migrates it, renders the home page and the plans page,
  and calls liveness and readiness. Any startup exit or any response other than 200 fails the job. **BREAKING
  (deploy flow):** `release-main` loses its git push trigger. A CI job on main starts it through the Northflank API
  after the gate and the image smoke pass, and the run builds the commit CI tested. A manual run from the Northflank
  console stays the emergency path.
- **Monitoring.** A web server render that returns a 5xx status is reported to Sentry, not only a render that throws.
  Sentry events from the api and the worker are tagged with the commit SHA as their release. The external monitor
  polls the readiness route instead of `/api/health`. The README lists three manual steps: the Sentry release alert,
  an error-rate alert, and a Sentry uptime monitor on `https://carlnotes.com/`. Every alert notifies by email and by
  push to the Sentry mobile app.
- **Docs.** The README's Architecture section and its deploy text describe the setup above as the current state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deploy-mechanics`: adds the readiness route, the production fail-fast startup, the Northflank probes, the image
  smoke job, and the CI-triggered release. The external monitor requirement moves to the readiness route.
- `static-serving`: a missing web build degrades to 404 pages only outside production.
- `workspace-structure`: every workspace declares each third-party package its runtime code and its built output
  import.
- `monitoring-analytics`: the uptime monitor polls readiness, plus a home page monitor. Sentry events include the
  commit SHA as their release. A 5xx render and a startup failure are reported. The readiness route is sampled at zero.

## Impact

- `apps/api/index.ts`: the readiness route, the production exit, and render 5xx reporting.
- `apps/worker/temporal.ts`: reports a startup failure before it exits.
- `packages/server/monitoring.ts`: the release tag, and readiness sampled at zero.
- `packages/db/index.ts`: an opt-in WebSocket proxy setting, so the Neon driver can reach a local Postgres in the
  image smoke job.
- `scripts/importBoundaries.ts`, `scripts/packageBoundaries.ts`, and a new `scripts/check-built-dependencies.ts`, plus
  the workspace `package.json` files the check finds lacking declarations.
- `Dockerfile`: runs the built output check after `build:ui`.
- `.github/workflows/ci.yml`: adds the image smoke and release jobs. Needs a `NORTHFLANK_API_TOKEN` secret in a
  `production` GitHub environment limited to `main`.
- `infra/northflank/release-main.json` (the trigger is removed, the commit is an argument, and the deploy step waits
  for readiness) and `infra/northflank/app-health-checks.json`. The owner applies both in Northflank.
- `README.md`, `AGENTS.md`, `CLAUDE.md`: the deploy text, the new script, and the gate list.
- Interacts with the unapplied `split-web-from-api` change, which adds a `web` service. Its health checks reuse the
  readiness route described here.

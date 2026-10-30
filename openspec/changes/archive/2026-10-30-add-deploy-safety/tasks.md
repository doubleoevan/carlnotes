## 1. Declared dependencies

- [x] 1.1 Extend `toImportViolations` in `scripts/importBoundaries.ts` to fail on a third-party import that the file's
  workspace does not declare. Built-ins (`node:`, `bun:`, and `builtinModules`), `@carlnotes` packages, and path
  aliases are exempt. Verify with new cases in `scripts/importBoundaries.test.ts`: a sibling-only package fails, and
  `node:path` passes.
- [x] 1.2 Add the runtime rule. In `apps/api`, `apps/worker`, `apps/web`, and every package, a value import of a
  dev-only dependency fails. Type-only imports, `*.test.*`, `*.stories.*`, `*.smoke.ts`, and config files are exempt.
  Verify with tests for a runtime file that fails and a test file that passes.
- [x] 1.3 Add the web closure rule to `scripts/packageBoundaries.ts`. `apps/web` must declare in `dependencies` every
  third-party package that the runtime files of its `@carlnotes` closure import. Verify with a test where `zod` from
  `packages/contracts` fails if `apps/web` does not declare it.
- [x] 1.4 Run `bun scripts/check-package-boundaries.ts`, and fix every finding by declaring the package in the
  workspace that imports it, at the version the lockfile already resolves. Then run `bun install` with the pinned Bun.
  Verify the check passes and `git diff bun.lock` changes only those workspaces.
- [x] 1.5 Add `scripts/check-built-dependencies.ts`, which reuses `toParsedImports` over `apps/web/dist/server/**/*.js`
  and exits non-zero naming each undeclared bare package and its file. Port the scan half of the incident's one-off boot
  check into it. Add `RUN bun scripts/check-built-dependencies.ts` to the Dockerfile right after `build:ui`, plus a root
  script for running it locally. Verify by running it after `bun run build:ui`: it passes, then fails once `zod` is
  removed from `apps/web/package.json`.
- [x] 1.6 Document both checks in `AGENTS.md`'s Verification paragraph, `scripts/` in its AGENTS.md if one lists the
  checks, and the README's Development section. Verify `bunx biome check .` passes.

## 2. Fail fast and report

- [x] 2.1 Add `startup` to `reportedStages` in `packages/server/monitoring.ts`. Verify
  `packages/server/monitoring.test.ts` passes.
- [x] 2.2 In `apps/api/index.ts`, at boot, if `NODE_ENV` is `production` and the import result is `missing` or
  `failed`, log the error, `reportError(error, "startup")`, `await shutdownMonitoring()`, and `process.exit(1)`.
  Verify with a test that runs the entry in a subprocess with `NODE_ENV=production` and an empty `apps/web/dist`
  stand-in, and asserts exit code 1 with no listener. Also run `bun run dev:api` with no build and confirm it still
  listens.
- [x] 2.3 In `apps/worker/temporal.ts`, make `run().catch` report the error in the `startup` stage and await
  `shutdownMonitoring()` before `process.exit(1)`. Verify with a test that stubs a failing connection and asserts one
  report and exit code 1.
- [x] 2.4 Search the `apps/api` and `apps/worker` entry modules for top-level `catch` blocks, and decide each new
  finding by the design's test: a broken build is fatal, and an outside outage is not. Record the decisions in
  design.md's audit table. Verify that the table names every `catch` the search finds.
- [x] 2.5 Report a non-degraded render with `status >= 500` in `toRenderedPageResponse`, in the `page-render` stage
  with its path. Verify with a test where a stubbed `uiServer` returns a 500: exactly one report, and the 500 reaches
  the client.
- [ ] 2.6 In Sentry, look for `page-render` events from the `prd` environment between the 4752b07 deploy and the
  7e2f51d0 deploy on 2026-10-29. If they are there, note in design.md that the gap was alerting. If none arrived, find
  the cause and fix it here. Verify by writing the finding in design.md's risk entry.

## 3. Readiness

- [x] 3.1 Add `GET /api/health/ready` beside `/api/health` in `apps/api/index.ts`. It renders
  `http://localhost/privacy` through the loaded `uiServer.fetch` under `withTimeLimit` (5 s), skips the page guards,
  and sets `Cache-Control: no-store`. It responds 200 `{status: "ok"}`, or 503 `{status: "unavailable", reason}` if
  the build is missing, the import failed, the render returned a status other than 200, it threw, or it timed out.
  Verify with tests for each branch.
- [x] 3.2 Add a test that replaces `globalThis.fetch` and the database pool's `query` with versions that throw and
  sends a session cookie, then asserts readiness still responds 200. Verify the test fails if `/privacy` is swapped
  for `/`.
- [x] 3.3 Add `/api/health/ready` to the health-check paths that `toTracesSampleRate` samples at zero. Verify with a
  case in the existing sampling test.

## 4. Image smoke in CI

- [x] 4.1 In `packages/db/index.ts`, if `DATABASE_WS_PROXY` is set, set `neonConfig.wsProxy`, turn off
  `useSecureWebSocket`, and turn off `pipelineTLS` and `pipelineConnect`. Add it to `.env.example` as optional and
  CI-only. Verify with a unit test on the config, and confirm that production's Doppler config does not set it
  (`grep -c` style, with no values printed).
- [ ] 4.2 Add an `image-smoke` job to `.github/workflows/ci.yml` for pull requests and pushes into main. It runs a
  buildx build with the GHA cache and the public Turnstile test key. On one Docker network it starts
  `pgvector/pgvector:pg17` and Neon's `wsproxy`, pinned by digest. It runs `bun packages/db/migrate.ts` from the
  image, then starts
  `bun apps/api/index.ts` with `NODE_ENV=production` and the dummy settings, polls `/api/health` for up to 90 s, and
  prints the boot time. It requests `/`, `/plans`, `/api/health`, and `/api/health/ready`, and fails on an exited
  container or any status other than 200, printing `docker logs` on failure. Every action is pinned by SHA. Verify the
  job passes on this change's pull request.
- [ ] 4.3 Confirm `/plans` renders 200 against the empty migrated database. If it reads something an empty database
  lacks, swap in another public page with no loader, and update the deploy-mechanics delta to match. Verify in the job
  log.
- [ ] 4.4 Document the image smoke job in the README's Development section, including how to run the same steps
  locally with Docker. Verify that the documented commands run on this machine.

## 5. Release gating and probes

- [x] 5.1 In `infra/northflank/release-main.json`, remove `triggers`, declare the `sha` argument, make the build step
  build `${args.sha}`, and give `deploy-app` and `deploy-worker` a `timeoutDuration` of 600 seconds on their
  `running` condition, the one condition Northflank documents for a Release node. Verify with
  `jq . infra/northflank/release-main.json`.
- [x] 5.2 Add a `release` job to `ci.yml` with `needs: [gate, image-smoke]`, only for `push` to `refs/heads/main`. It
  starts `release-main` through the Northflank API with `sha: ${{ github.sha }}` and `NORTHFLANK_API_TOKEN`, and
  fails if the API rejects the run. Verify the job's condition with `actionlint` and its request against Northflank's
  API docs.
- [x] 5.3 Add `infra/northflank/app-health-checks.json` with the design's startup, readiness, and liveness values,
  setting the startup threshold from the boot time measured in 4.2. Verify with `jq .` and by checking the field names
  against Northflank's service API docs.
- [x] 5.4 Set the Sentry `release` in `startMonitoring` from `SENTRY_RELEASE`, falling back to the commit SHA
  variable that Northflank injects. If it injects none, add a `GIT_SHA` build argument to the Dockerfile that is
  exposed as `SENTRY_RELEASE` and passed from `${args.sha}`. Leave the release unset if neither exists. Verify with a
  unit test for each source.
- [x] 5.5 Document in the README the CI-started release, the console run as the emergency path, both Northflank
  files, and the migration order from design.md. Add a "Deploy safety" subsection to the Architecture section. Verify
  that the README describes current state with no history.

## 6. Monitoring docs

- [x] 6.1 Add the manual alert steps to the README's Development section, each notifying by email and by Sentry
  mobile push: point the external monitor at `/api/health/ready`, a Sentry alert for a new issue in a release, a
  Sentry alert for an error-rate spike, and a Sentry uptime monitor on `https://carlnotes.com/`. Verify that each step
  names the exact place to set it up.

## 7. Reproduce the incident

- [x] 7.1 On a scratch branch, remove `zod` from `apps/web/package.json` and run `bun install`. Show that
  `bun scripts/check-package-boundaries.ts` fails naming `zod`. Verify by saving the output.
- [ ] 7.2 With the scratch branch's lockfile, build the image locally. Show that it fails at the built-dependency step.
  Then build with that step skipped, and show that the container exits 1 at boot with the import error. Verify by
  saving both logs.
- [x] 7.3 Run the api from the scratch build with `NODE_ENV` unset, and show that `/api/health/ready` responds 503 while
  `/api/health` responds 200. Verify by saving both responses.
- [ ] 7.4 Push the scratch branch as a draft pull request, and show that `image-smoke` fails. Close the pull request
  and delete the branch. Verify by linking the failed run in the ship notes.
- [x] 7.5 Run the full gate, `bash scripts/preflight.sh`, on the real branch. Verify it prints `preflight green`.

## Workflow follow-up

- Owner: create the `production` GitHub environment limited to `main`, and add `NORTHFLANK_API_TOKEN` as its secret.
- Owner: after the push deploys, apply `release-main.json` and then `app-health-checks.json` in Northflank, re-point
  the external monitor, and create the Sentry alerts and the uptime monitor.
- Ship through `/ship`, and archive with `openspec archive add-deploy-safety --yes`.

# workspace-structure Specification

## Purpose
TBD - created by archiving change apps-and-packages-restructure. Update Purpose after archive.
## Requirements
### Requirement: The repo is Bun workspaces of thin apps over private packages

The root `package.json` SHALL declare the workspaces `apps/*` and `packages/*`, hold the root scripts and the toolchain
and root-level dependencies that `evals/` and `scripts/` import, and nothing an app or a package runs. Each app and each
package SHALL have its own `package.json` naming its own dependencies at the versions the root held before the split,
and no other `package.json` SHALL exist. A package SHALL be private, named `@carlnotes/<name>`, and export TypeScript
source through its `exports` field with no build step of its own. An app SHALL be a deployable entry point: `apps/web`
is the TanStack Start app, `apps/api` the Hono server and MCP server, `apps/worker` the Temporal worker and the other
process entries, and `apps/docs` the Starlight site. `evals/`, `scripts/`, `content/`, `infra/`, `openspec/`,
`litellm-config.yaml`, and the Dockerfile SHALL stay at the root. The edit hook `scripts/check-structure.sh` SHALL fail
on a `package.json` outside the root, `apps/<name>/`, and `packages/<name>/`, and the structure change SHALL add no
dependency and no task runner.

#### Scenario: A stray package.json fails the hook

- **WHEN** an edit writes `packages/db/schema/package.json`
- **THEN** `scripts/check-structure.sh` exits non-zero naming the path, and the edit is blocked

#### Scenario: An app runs from its own package.json

- **WHEN** `bun run dev:api` starts `apps/api/index.ts`
- **THEN** every import it resolves is declared in `apps/api/package.json` or in a `@carlnotes/*` package it names

### Requirement: Universal packages are provably free of server code

`@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, and `@carlnotes/nightshift` SHALL be universal: each
SHALL depend only on universal packages and on third-party packages; a Biome rule over the four packages SHALL forbid
the browser and runtime globals `window`, `document`, `navigator`, `location`, `localStorage`, `sessionStorage`,
`history`, `matchMedia`, `Bun`, and `process` outside tests, and the package boundary check SHALL forbid an import of
`bun`, a `bun:*` module, or a `node:*` module outside tests, so a reference to any of them fails preflight; and the
runtime dependency closure of its `dependencies`, walked through each installed package's own `dependencies`, SHALL
include none of `drizzle-orm`, `@neondatabase/serverless`, any `@temporalio/*` package, `stripe`, `satori`,
`@resvg/resvg-js`, `posthog-node`, `@sentry/bun`, or `@opentelemetry/sdk-trace-node`. A module SHALL be classified by
that rule, not by its name: a module that reads `Bun.env` or a Node built-in is server code whatever it is called, so
the podcast constants are `@carlnotes/contracts/podcastEpisodes` and the speech setting and the cover signer are
`@carlnotes/server/podcastEpisodeSettings` and `@carlnotes/server/podcastCoverPaths`. A script that writes a file from a
universal package's values SHALL live in `scripts/`, never in the package. The package boundary check SHALL run in
preflight and fail on the first violation it finds, naming the package, the file, and the import.

#### Scenario: A DOM reference fails the universal rule

- **WHEN** a module in `@carlnotes/core` reads `window.location`
- **THEN** Biome fails on that line in preflight, whether or not the module would have run in the browser

#### Scenario: A server package in the closure fails preflight

- **WHEN** `@carlnotes/client` adds `@carlnotes/db` to its dependencies
- **THEN** the package boundary check fails naming `@carlnotes/client`, `@carlnotes/db`, and `drizzle-orm`

#### Scenario: The podcast constants stay universal

- **WHEN** `apps/web` imports the podcast show name and the cover sizes
- **THEN** the import resolves in `@carlnotes/contracts`, and the speech model setting and the cover key signer resolve
  only in `@carlnotes/server`

#### Scenario: A file write in the design system fails the universal rule

- **WHEN** a module in `@carlnotes/nightshift` imports `node:fs` to write `tokens.css`
- **THEN** the package boundary check fails naming the package, the file, and the import

### Requirement: Apps never import apps, and each boundary is declared

An app SHALL import no other app, and a package SHALL import no app, with one exception: `@carlnotes/client` and
`apps/web` SHALL import `AppType` and the `auth` type from `@carlnotes/api` with `import type` alone, declared as a
development dependency. A file SHALL import another workspace only by its package name, never by a relative path that
leaves its own app or package. Each workspace's `tsconfig.json` references SHALL name exactly the `@carlnotes/*`
packages its `package.json` depends on. The typed api client SHALL take its base url when an app configures it, and
`apps/web` SHALL pass the base url and the error display from `apps/web/src/lib/webApiClient.ts`. The package boundary
check SHALL enforce each rule in preflight.

#### Scenario: A value import of the api fails

- **WHEN** a file in `apps/web` imports a function from `@carlnotes/api`
- **THEN** the package boundary check fails naming the file and the import

#### Scenario: A relative import across workspaces fails

- **WHEN** a file in `packages/pipeline` imports `../../apps/worker/temporal`
- **THEN** the package boundary check fails naming the file and the path

#### Scenario: A dependency without a reference fails

- **WHEN** `packages/pipeline/package.json` depends on `@carlnotes/emails` and `packages/pipeline/tsconfig.json` does
  not reference `../emails`
- **THEN** the package boundary check fails naming the package and the missing reference

### Requirement: Every Northflank process starts through a stable root script

Every process Northflank starts SHALL have a root script that keeps its name across the move: `temporal` for the
Temporal worker, `schedule` for the scan sweep, `reset:monthly-budgets` for the budget reset, `db:migrate` for the
migrate job, `edge:purge` for the edge purge, and `docs:embed` for the docs embed, each running the process under
`doppler run`. Every existing root script SHALL keep its name, and every GitHub Actions job SHALL
keep its name. The Dockerfile's `CMD` SHALL keep starting the api under `doppler run`.

#### Scenario: The scripts survive the move

- **WHEN** the move ships and each Northflank process starts by its root script
- **THEN** every process starts without a command change in Northflank

### Requirement: One Bun version is pinned everywhere, and the lockfile is written by it

`.bun-version`, both `oven/bun` stages of the Dockerfile by tag and digest, the `@types/bun` range, and the `bunx bun@`
pin in the README SHALL name the same Bun version, 1.4.3, and `bun.lock` SHALL be regenerated by that version after the
package.json files split. CI SHALL keep reading the version from `.bun-version` through `.github/actions/setup-bun`.

#### Scenario: CI and the image run the same Bun

- **WHEN** CI installs Bun from `.bun-version` and the image builds from its `FROM` lines
- **THEN** both run 1.4.3, and the frozen install reads the lockfile without rewriting it

### Requirement: The image carries every path the runtime reads

The Dockerfile SHALL copy the root package.json, the lockfile, and every workspace `package.json` before `bun install
--frozen-lockfile`, SHALL keep the runtime stage's production install, and SHALL copy every package and app the runtime
reads: the server packages, `apps/api`, `apps/worker`, the built `apps/web/dist` with the built component browser in
it, the built `apps/docs/dist`, the docs markdown source, the podcast cover illustration, and `content/`. The build
stage SHALL run `build:storybook` after `build:ui`, and Storybook and its addons SHALL stay development dependencies, so
the production install leaves them out. Every path a module reads at runtime relative to the working directory or to
its own location SHALL resolve in the image and in a developer's checkout, and the design SHALL list each one. The
Temporal worker's workflow bundles SHALL build from `apps/worker/workflows` with workflow code that imports workspace
packages, which the workflow bundle check proves.

#### Scenario: The image serves a podcast cover

- **WHEN** the production image runs on the dev Doppler config and a podcast cover is requested
- **THEN** the cover draws over the illustration in the image and responds 200

#### Scenario: A workflow importing a package bundles

- **WHEN** `runTopicScan.ts` imports `@carlnotes/contracts/scanFailure` and the workflow bundle check runs
- **THEN** every workflow bundles, and the worker starts with the same bundles

#### Scenario: The image serves the component browser without Storybook installed

- **WHEN** the production image runs and `/nightshift/` is requested
- **THEN** the built component browser responds 200, and no `storybook` package is in the runtime's `node_modules`

### Requirement: The move changes no behavior

The move SHALL change no URL, response body, schema, UI, or deploy topology. `bun run db:generate` SHALL produce no
migration, `bun run check` and `bun run smoke` SHALL pass, and the documents the dev server serves (`/sitemap.xml`,
`/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/feed.xml`, `/indexnow.txt`, `/.well-known/security.txt`), a public
topic page's server-rendered HTML, a topic podcast feed, a share image, and a podcast cover SHALL be captured before the
move and diffed after it, differing only in hashed asset names.

#### Scenario: The captures match

- **WHEN** the captured responses are diffed after the move
- **THEN** every difference is a hashed asset name, and no other byte differs

#### Scenario: The schema is unchanged

- **WHEN** `bun run db:generate` runs after the move
- **THEN** it writes no migration


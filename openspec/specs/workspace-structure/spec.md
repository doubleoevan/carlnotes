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
process entries, `apps/docs` the Starlight site, and `apps/mobile` the Expo app. `evals/`, `scripts/`, `content/`,
`infra/`, `openspec/`, `litellm-config.yaml`, and the Dockerfile SHALL stay at the root. The edit hook
`scripts/check-structure.sh` SHALL fail on a `package.json` outside the root, `apps/<name>/`, and `packages/<name>/`,
and the structure change SHALL add no dependency and no task runner.

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

### Requirement: The mobile app depends only on the universal packages

`apps/mobile` SHALL be `@carlnotes/mobile`, an app package nothing imports, depending on `@carlnotes/*` packages only
among the universal four: `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, and `@carlnotes/nightshift`,
each resolved by package name through `node_modules` with no tsconfig paths and no Metro resolver aliases. The package
boundary check SHALL fail when `apps/mobile` declares or imports any `@carlnotes` package outside the universal four,
a type-only import of `@carlnotes/api` included, since the typed client already holds `AppType`, and the boundary
test SHALL cover that rule with a fixture. `apps/mobile/tsconfig.json` SHALL extend `tsconfig.base.json`, drop the DOM
lib so a browser global fails the type check, join the root solution file's references, and mirror its `package.json`
as the boundary check requires. Biome SHALL cover `apps/mobile` like every other workspace, and the restricted-globals
rule that guards the universal packages SHALL cover `apps/mobile` outside tests, denying the browser globals and `Bun`
but not `process`, which Metro inlines for `EXPO_PUBLIC_*` values.

#### Scenario: A server package import from the mobile app fails

- **WHEN** a fixture file in `apps/mobile` imports `@carlnotes/db`
- **THEN** the boundary check fails naming the file, the import, and the universal-four rule

#### Scenario: A type-only api import from the mobile app fails

- **WHEN** a file in `apps/mobile` declares or imports `@carlnotes/api`, `import type` included
- **THEN** the boundary check fails naming the rule, and the typed client remains the one path to `AppType`

#### Scenario: A browser or Bun global fails preflight for the mobile app

- **WHEN** a module in `apps/mobile` reads `document` or `Bun.env`
- **THEN** `tsc -b` fails on the browser global, because the mobile tsconfig has no DOM lib, and Biome fails the Bun
  global through the same restricted-globals rule that guards the universal packages

### Requirement: Each app bundle holds one React

`@carlnotes/core` SHALL declare `react` as a peer dependency, so the package stops pinning a React copy of its own, and
the repo SHALL hold one React version everywhere — the version the Expo SDK pins, declared exactly in every workspace
that declares React and in the root `devDependencies` — since Bun's isolated linker links exactly one React into a
workspace package's `node_modules` and silently follows the root pin when versions disagree. The mobile bundle and the web build
SHALL each hold exactly one React.

#### Scenario: The mobile bundle resolves one React

- **WHEN** Metro bundles `apps/mobile` through the isolated install and a `@carlnotes/core` hook runs on the proving
  screen
- **THEN** the hook reads the same React copy as the app's own components, and no invalid hook call fires

#### Scenario: The web build keeps one React

- **WHEN** `bun run build:ui` bundles `apps/web` after the peer dependency and version pin change
- **THEN** the build holds one React, and every hook works as before

### Requirement: The image leaves the mobile workspace out

The Dockerfile SHALL keep `apps/mobile` and every React Native dependency out of both stages: the build stage's install
SHALL still pass `--frozen-lockfile` against a lockfile that includes the mobile workspace, the runtime image SHALL
keep its size, and the web, docs, and Storybook builds SHALL be unchanged. `.dockerignore` SHALL match the decision the
design records.

#### Scenario: The production image builds without React Native

- **WHEN** the production image builds after the mobile workspace lands
- **THEN** the install passes frozen, no React Native package is in either stage's `node_modules`, and the image serves
  the web app, `/docs`, and `/nightshift` as before

### Requirement: CI proves Metro bundles through the isolated install

CI SHALL export the mobile app's iOS and Android JavaScript bundles with `expo export` on Linux, with no simulator, so
a change that breaks Metro's resolution through Bun's isolated install fails before a push lands. The export SHALL run
in CI alone, not in preflight, and the design SHALL say why given preflight's runtime.

#### Scenario: A broken mobile import fails CI

- **WHEN** a mobile module imports a package the isolated layout does not link to `apps/mobile`
- **THEN** the export fails naming the unresolved import, and the run goes red

### Requirement: Every workspace declares the third-party packages it imports

The package boundary check SHALL fail on an import of a third-party package that the importing file's own workspace
does not declare in `dependencies`, `devDependencies`, or `peerDependencies`. A package that resolves only because a
sibling workspace or the root declares it SHALL fail. Bun and Node built-in modules, `@carlnotes` packages (which the
existing boundary rule covers), and the workspace's own path aliases are exempt.

#### Scenario: A package another workspace declares fails

- **WHEN** a file in `apps/api` imports `hono`, which only `packages/server` declares
- **THEN** `bun scripts/check-package-boundaries.ts` exits non-zero, naming the file, the package, and `apps/api`

#### Scenario: A built-in module passes

- **WHEN** a file imports `node:path` or `bun:test`
- **THEN** the check reports nothing for that import

### Requirement: Runtime code imports no development-only dependency

In `apps/api`, `apps/worker`, `apps/web`, and every package, the boundary check SHALL fail on a value import that
names a package the workspace declares only in `devDependencies`, since the production install leaves those packages
out. Type-only imports, tests, stories, smoke files, and config files are exempt.

#### Scenario: A runtime import of a dev dependency fails

- **WHEN** `apps/api/index.ts` imports a value from a package that `apps/api` lists only under `devDependencies`
- **THEN** the check exits non-zero, naming the file and the package, and asking for it to move to `dependencies`

#### Scenario: A test may import a dev dependency

- **WHEN** `apps/api/index.test.ts` imports from a package that `apps/api` lists only under `devDependencies`
- **THEN** the check reports nothing for that import

### Requirement: The web app declares what its bundled packages import

Because the web server build bundles the `@carlnotes` packages and leaves their third-party imports external, the
boundary check SHALL fail if `apps/web` does not declare in `dependencies` each package that the runtime code of a
`@carlnotes` package in its dependency closure imports.

#### Scenario: A universal package's import is declared by the web app

- **WHEN** `packages/contracts` imports `zod` at runtime and `apps/web` does not declare `zod` in `dependencies`
- **THEN** the check exits non-zero, naming `zod`, `apps/web`, and the package that imports it

### Requirement: The image build fails on an undeclared external in the web server build

The Dockerfile's build stage SHALL run a check after `build:ui` that reads every import of a bare package name in
`apps/web/dist/server` and fails the build if `apps/web` does not declare that package in `dependencies`. Built-in
modules are exempt.

#### Scenario: An undeclared external stops the image build

- **WHEN** the web server build imports `zod` and `apps/web/package.json` does not declare it in `dependencies`
- **THEN** the Docker build fails at that step, naming `zod` and the built file that imports it

#### Scenario: A declared build passes

- **WHEN** every bare import in the web server build is declared in `apps/web`'s `dependencies`
- **THEN** the step passes, and the build continues to `build:docs`

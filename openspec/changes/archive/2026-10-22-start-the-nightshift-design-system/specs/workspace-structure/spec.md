## MODIFIED Requirements

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

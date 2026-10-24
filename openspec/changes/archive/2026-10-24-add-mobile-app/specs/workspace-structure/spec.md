# workspace-structure delta: add-mobile-app

## MODIFIED Requirements

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

## ADDED Requirements

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

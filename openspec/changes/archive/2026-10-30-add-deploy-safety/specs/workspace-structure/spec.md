## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Every Northflank process starts through a stable root script

Every process Northflank starts SHALL have a root script that keeps its name across the move: `temporal` for the
Temporal worker, `schedule` for the scan sweep, `reset:monthly-budgets` for the budget reset, `db:migrate` for the
migrate job, `edge:purge` for the edge purge, and `docs:embed` for the docs embed, each running the process under
`doppler run`. The `web` service SHALL start through the root script `web`, which starts the api's entry under the
process name `web`. The worker's two queue groups SHALL start through the root scripts `temporal:main` and `temporal:films`,
which set `WORKER_QUEUE_GROUP` in the command after `doppler run --`, because a Doppler value would override one set on the
service. Every existing root script SHALL keep its name, and every GitHub Actions job SHALL keep its name. The
Dockerfile's `CMD` SHALL keep starting the api under `doppler run`.

#### Scenario: The scripts survive the move

- **WHEN** the move ships and each Northflank process starts by its root script
- **THEN** every process starts without a command change in Northflank

#### Scenario: The web service and the worker queue groups start by script

- **WHEN** Northflank starts the `web` service with `bun run web`, the main worker with `bun run temporal:main`, and
  the film service with `bun run temporal:films`
- **THEN** the first starts the api's entry as `web`, the other two start the worker in their queue groups, and
  `bun run temporal` still starts a worker that hosts every Worker

### Requirement: Preflight fails on dead code across files

Preflight SHALL run a dead-code check over the root workspace, every `apps/*` workspace, and every `packages/*`
workspace, right after the package boundary check. It SHALL fail on an unused file, an unused export, or a declared
dependency that nothing imports, naming each finding's file, export, or package. It SHALL run offline. Generated
output, `openspec/`, the vendored skills under `.agents/`, and `.opencode/` are out of its scope.

#### Scenario: An unused export fails preflight

- **WHEN** a module in `packages/core` adds an exported function that no file imports
- **THEN** `bash scripts/preflight.sh` exits non-zero, naming the module and the export

#### Scenario: An unused dependency fails preflight

- **WHEN** `apps/api/package.json` adds a dependency that no file in `apps/api` imports
- **THEN** `bash scripts/preflight.sh` exits non-zero, naming `apps/api/package.json` and the package

#### Scenario: An unused file fails preflight

- **WHEN** a new file in `apps/web/src/lib/` is imported by no entry point
- **THEN** `bash scripts/preflight.sh` exits non-zero, naming the file

#### Scenario: A file loaded by path passes

- **WHEN** `apps/worker/temporalWorkers.ts` loads a workflow file through `new URL(...)` instead of an import
- **THEN** the dead-code check reports nothing for that workflow file

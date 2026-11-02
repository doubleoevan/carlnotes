## ADDED Requirements

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

- **WHEN** `apps/worker/temporal.ts` loads a workflow file through `new URL(...)` instead of an import
- **THEN** the dead-code check reports nothing for that workflow file

### Requirement: A dead-code exception names one item and where it is used

Each exception to the dead-code check SHALL name one file, one export, or one dependency, never a glob. Each SHALL say
where the item is loaded or why it stays: a package.json script, the Dockerfile, a shell script, a workflow, a
path-based load, or a tool that reads it by convention. An exception that matches nothing SHALL fail the check.

#### Scenario: A glob exception is rejected

- **WHEN** the dead-code config ignores a pattern such as `scripts/**`
- **THEN** review rejects it, and the config names each file under `scripts/` that a shell script or a workflow runs

#### Scenario: A file only a shell script runs is declared

- **WHEN** `scripts/image-smoke.sh` runs a TypeScript file that no package.json script or import reaches
- **THEN** the config declares that file as an entry, beside a note naming `scripts/image-smoke.sh`

#### Scenario: An exception that matches nothing fails preflight

- **WHEN** a file named as an entry or an ignore is deleted and its line stays in the dead-code config
- **THEN** the dead-code check exits non-zero, naming the line that matches nothing

### Requirement: Preflight fails on an import cycle

Biome's `noImportCycles` rule SHALL run at error level over every file Biome checks, so preflight fails on a value
import that closes a cycle, naming each file in it. A cycle SHALL be broken by moving the code that both sides share
into a module that imports neither. A type-only import SHALL not count toward a cycle.

#### Scenario: A two-file cycle fails preflight

- **WHEN** one new module imports a value from a second, and the second imports a value from the first
- **THEN** `bunx biome check .` exits non-zero, naming both files and the import that closes the cycle

#### Scenario: A Drizzle table that references another file's table passes

- **WHEN** a schema file declares a foreign key to a table in another schema file that does not import it back
- **THEN** Biome reports no cycle, and `bun run db:generate` reports no schema change after a table moves between files

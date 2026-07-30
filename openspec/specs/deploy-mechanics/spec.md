# deploy-mechanics Specification

## Purpose
TBD - created by archiving change add-deploy-health-and-migrations. Update Purpose after archive.
## Requirements
### Requirement: The app service exposes a liveness route

The app service SHALL answer `GET /api/health` with 200 and a JSON body reporting that the process is up. The route SHALL NOT query the database, and SHALL NOT require or resolve a session, so that an unreachable database never presents as a dead instance.

#### Scenario: A healthy process answers

- **WHEN** the platform requests `/api/health`
- **THEN** the app answers 200 with a JSON status body

#### Scenario: An unreachable database does not fail the check

- **WHEN** the process is running but no database connection can be made
- **THEN** `/api/health` still answers 200, so the platform leaves the instance alone rather than restarting it

### Requirement: Schema migrations are applied by a one-shot job

Pending migrations SHALL be applied by a script that runs once and exits, executed as a deploy job against the deployed image before the new service rolls out. The container start command SHALL NOT apply migrations, so that instances starting concurrently cannot race on the same migration.

The script SHALL apply only migrations the database has not already recorded, SHALL resolve the migration folder relative to its own location rather than the working directory, and SHALL close its database connection so the job exits on its own.

#### Scenario: A pending migration is applied once

- **WHEN** the job runs against a database missing the newest migration
- **THEN** that migration is applied, recorded, and the process exits

#### Scenario: An already-migrated database is untouched

- **WHEN** the job runs against a database that already records every migration in the journal
- **THEN** nothing is applied and the process exits successfully

#### Scenario: Starting the server does not migrate

- **WHEN** a container starts
- **THEN** it serves requests without applying any migration

### Requirement: One migration mechanism serves local and production

Migrations SHALL be applied through the same script locally and in production, and that script SHALL depend only on packages present in the production image. It SHALL NOT depend on the `drizzle-kit` CLI, which is a dev dependency the production install prunes, or on a config file the image does not carry.

#### Scenario: The local command runs the deploy script

- **WHEN** a developer runs `bun run db:migrate`
- **THEN** it runs the same script the deploy job runs, against the database their environment points at

#### Scenario: The job runs from the production image

- **WHEN** the job runs on an image built with production dependencies only
- **THEN** it resolves its migrator and database driver without a missing-package failure


## MODIFIED Requirements

### Requirement: Schema migrations are applied by a one-shot job

Pending migrations SHALL be applied by a script that runs once and exits, executed as a deploy job against the deployed image before the new service rolls out. The container start command SHALL NOT apply migrations, so that instances starting concurrently cannot race on the same migration.

The script SHALL apply only migrations the database has not already recorded, SHALL resolve the migration folder relative to its own location rather than the working directory, and SHALL close its database connection so the job exits on its own. After migrating, the script SHALL set the app role's `statement_timeout` to 30 seconds in the app's database, as the request-capacity capability states, and a failure to set it, such as for a role without the privilege, SHALL be logged without failing the job.

#### Scenario: A pending migration is applied once

- **WHEN** the job runs against a database missing the newest migration
- **THEN** that migration is applied, recorded, and the process exits

#### Scenario: An already-migrated database is untouched

- **WHEN** the job runs against a database that already records every migration in the journal
- **THEN** nothing is applied and the process exits successfully

#### Scenario: Starting the server does not migrate

- **WHEN** a container starts
- **THEN** it serves requests without applying any migration

#### Scenario: The job bounds the role's statements

- **WHEN** the job finishes migrating
- **THEN** the role's statements in the app's database are cancelled after 30 seconds

## MODIFIED Requirements

### Requirement: Source is a topic input with an optional Integration
A Source SHALL belong to a Topic and declare a `kind` from {url, rss, reddit, youtube, search, composio, plugin}. Its `integration_id` MUST be nullable so credential-free sources (RSS) need no Integration, and MUST reference `integrations` when present.

A Source SHALL carry an async screening `status` from {pending, ready, failed}, defaulting to `pending`, and a nullable `error` holding the reason a screen rejected it. The status SHALL be backed by its own Postgres enum rather than reusing the attachment status type, so the column's type names what it describes. The migration that adds the columns SHALL set every existing Source to `ready`, since an existing Source has already been trusted and a `pending` backfill would hide every Source from readers and make every Scan ingest nothing.

#### Scenario: A keyless source has no integration
- **WHEN** an RSS source is created
- **THEN** its `integration_id` is null and the row is valid

#### Scenario: A credentialed source references an integration
- **WHEN** a composio source is created
- **THEN** its `integration_id` references an `integrations` row

#### Scenario: A Source carries a screening status and reason
- **WHEN** a Source is created without an explicit status
- **THEN** its `status` is `pending` and its `error` is null

#### Scenario: Existing Sources survive the migration
- **WHEN** the migration adding the status and error columns runs against a database with existing Sources
- **THEN** every existing Source row is `ready`, so no Source is hidden and no Scan loses an input

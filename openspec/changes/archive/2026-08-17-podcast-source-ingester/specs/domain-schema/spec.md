## ADDED Requirements

### Requirement: Resource carries an optional transcript URL

A Resource SHALL have a nullable `transcript_url` column holding the address of a transcript its Source published for it, filled at ingestion when the Source names one and null otherwise. It SHALL be the address only: the transcript's text lives where every other Resource body lives, in object storage under `content_key`, and is written by curation's fetch stage rather than at ingestion. The column SHALL be independent of Resource kind, so any Source that can name a transcript for what it finds fills the same column.

#### Scenario: An ingested episode carries its transcript address

- **WHEN** a podcast feed entry names a transcript and its Resource is upserted
- **THEN** the `resources` row holds that address in `transcript_url` and its `content_key` is still null

#### Scenario: A Resource with no published transcript

- **WHEN** a Resource is ingested from a Source that names no transcript for it
- **THEN** its `transcript_url` is null and the row is valid

### Requirement: Schema migration for the podcast source kind and transcript URL

The change SHALL include a generated Drizzle migration that adds `podcast` to the `source_kind` enum and adds the nullable `transcript_url` column to `resources`. Applying it to a database at the current schema MUST succeed without altering any other table, and MUST leave every existing Source and Resource row valid and unchanged.

#### Scenario: The migration applies cleanly

- **WHEN** the migration runs against a database at the current schema
- **THEN** `source_kind` accepts `podcast`, `resources.transcript_url` exists and is null on every existing row, and no other table is altered

## MODIFIED Requirements

### Requirement: Source is a topic input with an optional Integration
A Source SHALL belong to a Topic and declare a `kind` from {url, rss, reddit, youtube, podcast, search, composio, plugin}. Its `integration_id` MUST be nullable so credential-free sources (RSS, podcast) need no Integration, and MUST reference `integrations` when present.

#### Scenario: A keyless source has no integration
- **WHEN** an RSS source is created
- **THEN** its `integration_id` is null and the row is valid

#### Scenario: A podcast source has no integration
- **WHEN** a podcast source is created
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

#### Scenario: An x source names a handle and holds no integration
- **WHEN** a Source of kind `x` is created with a handle in its `config`
- **THEN** the row is valid, its `config` carries that handle, and its `integration_id` is null

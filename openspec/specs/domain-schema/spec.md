# domain-schema Specification

## Purpose
TBD - created by archiving change add-domain-schema. Update Purpose after archive.
## Requirements
### Requirement: Canonical domain entities are persisted
The schema SHALL define the canonical domain vocabulary as Drizzle tables: Topic, Source, Scan, Resource, Finding, Subscription, Audience, and Integration, plus a `users` table and an `audience_members` join. Entity names MUST be singular in code and plural as table names. No rejected term (Channel, Item, Update, Run, Crawl, Group, List, Cohort, Follow) SHALL be used as a domain entity, table, or type name. This scopes to domain nouns only — incidental substrings in standard column names (e.g. `updated_at`, `created_at`) are exempt.

#### Scenario: Schema type-checks and exposes every entity
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a Drizzle table for each of `topics`, `sources`, `scans`, `resources`, `findings`, `subscriptions`, `audiences`, `audience_members`, `integrations`, and `users`

#### Scenario: No rejected domain noun appears
- **WHEN** the schema's entity, table, and type names are inspected
- **THEN** none is a rejected domain noun, and standard columns like `updated_at` are not flagged

### Requirement: Users table anchors ownership
The schema SHALL define a `users` table shaped to Better Auth's current core columns (as documented by its Drizzle adapter) so Better Auth can adopt it at launch without a rewrite. Email MUST be unique.

#### Scenario: A user owns records via foreign keys
- **WHEN** a topic, audience, or integration row is created
- **THEN** its owner/user reference is a foreign key to `users.id`

#### Scenario: Email is unique
- **WHEN** two user rows are inserted with the same email
- **THEN** the database rejects the second insert

### Requirement: Topic is the configuration and the authority anchor
A Topic SHALL carry its name, context document, cadence, privacy level (public, invite, or private), and `owner_id` referencing `users`. Authority MUST be expressed only through `owner_id`; the schema MUST NOT define a role enum.

#### Scenario: Topic records its owner and privacy
- **WHEN** a topic row is created
- **THEN** it stores `owner_id`, a privacy value from {public, invite, private}, and a cadence value

#### Scenario: Authority is ownership, not a role
- **WHEN** the schema is inspected
- **THEN** no `role` column or role enum exists on any table

### Requirement: Source is a topic input with an optional Integration
A Source SHALL belong to a Topic and declare a `kind` from {rss, reddit, youtube, search, composio, plugin}. Its `integration_id` MUST be nullable so credential-free sources (RSS) need no Integration, and MUST reference `integrations` when present.

#### Scenario: A keyless source has no integration
- **WHEN** an RSS source is created
- **THEN** its `integration_id` is null and the row is valid

#### Scenario: A credentialed source references an integration
- **WHEN** a composio source is created
- **THEN** its `integration_id` references an `integrations` row

### Requirement: Scan is one execution of a topic's pipeline
A Scan SHALL reference its Topic and record start and finish timestamps, its cost, item counts, an `ai_summary` recap of what the scan did, a `status` from {running, succeeded, failed}, and a nullable `error`. Diff-since-last-scan MUST advance its baseline only on a succeeded scan, so a failed scan is skipped and never suppresses the next run's findings. The word "run" MUST NOT appear as a domain field; Scan is the domain term.

#### Scenario: A scan records status, cost, and summary
- **WHEN** a scan completes successfully
- **THEN** its row holds `status` = succeeded, a null `error`, a numeric cost, counts, and an `ai_summary` value

#### Scenario: A failed scan does not advance the diff baseline
- **WHEN** the most recent scan for a topic has `status` = failed
- **THEN** diff-since-last-scan uses the last succeeded scan as its baseline

### Requirement: Resource is a globally deduplicated external artifact
A Resource SHALL be canonical and global, keyed for dedupe on its canonical URL, and MUST NOT be topic-scoped. It SHALL carry a content hash and a `kind` from {read, watch, listen}. Re-ingesting the same canonical URL MUST NOT create a duplicate Resource.

#### Scenario: Canonical URL is unique
- **WHEN** two resources are upserted with the same canonical URL
- **THEN** only one `resources` row exists afterward

### Requirement: Resource carries an optional vector embedding and its model
A Resource SHALL have a nullable pgvector `embedding` column and a nullable `embedding_model` column recording which model produced it. Both are null at ingestion and populated when the pipeline embeds the Resource, so a model change is a backfill rather than a schema change.

#### Scenario: Ingestion inserts before embedding
- **WHEN** a resource is first ingested by an adapter
- **THEN** the row is valid with `embedding` and `embedding_model` null

#### Scenario: Embedding and its provenance are stored
- **WHEN** the pipeline embeds a resource
- **THEN** the row stores a vector `embedding` and the `embedding_model` string that produced it

### Requirement: Finding is a topic-scoped judgment about a Resource
A Finding SHALL reference both its Topic and its Resource and carry a signal score, a why-summary, a `source_visibility` provenance value, and an optional thumbs value. `(topic_id, resource_id)` MUST be unique, so re-scoring a Resource in the same Topic updates the existing Finding instead of inserting a duplicate. One Resource MUST still be able to have many Findings across different Topics.

#### Scenario: One resource yields findings in multiple topics
- **WHEN** the same resource is judged relevant to two topics
- **THEN** two `findings` rows exist, each referencing the shared `resources` row and its own `topics` row

#### Scenario: Re-scoring updates in place
- **WHEN** a resource already has a finding in a topic and is scored again in that topic
- **THEN** the existing `findings` row is updated and no duplicate row is created

### Requirement: Feed is derived, not stored
A topic's Feed SHALL be the set of Findings scoped to that Topic, resolved by query. The schema MUST NOT define a `feeds` table.

#### Scenario: No feeds table exists
- **WHEN** the schema and migration are inspected
- **THEN** there is no `feeds` table, and a topic's feed is obtained by selecting findings where `topic_id` matches

### Requirement: Subscription joins a subscriber to a Topic
A Subscription SHALL reference a Topic and exactly one subscriber that is either a user or an Audience, and SHALL carry delivery preferences (cadence, digest). The exclusivity MUST be enforced by a database constraint.

#### Scenario: Subscriber is a user xor an audience
- **WHEN** a subscription row sets both a user subscriber and an audience subscriber, or neither
- **THEN** the database rejects the row

### Requirement: Audience is a named set of users that subscribes as one
An Audience SHALL be owned by a user and have members joined through `audience_members`. Each `audience_members` row MUST reference both an `audiences` row and a `users` row.

#### Scenario: Members join an audience
- **WHEN** a user is added to an audience
- **THEN** an `audience_members` row references both the audience and the user

### Requirement: Integration is a user's reusable connected account
An Integration SHALL belong to a user and hold the connected-account grant and scopes, and MUST be referenceable by Sources (input) so a credential is connected once and reused.

#### Scenario: A source resolves credentials through an integration
- **WHEN** a source needs credentials
- **THEN** it references an `integrations` row rather than storing credentials inline

### Requirement: Initial migration provisions the schema and pgvector
The change SHALL include a generated initial migration that creates every domain table and enables the pgvector extension before any vector column is created. Applying the migration to an empty database MUST succeed.

#### Scenario: Migration enables pgvector and creates tables
- **WHEN** the initial migration is applied to an empty Postgres database
- **THEN** it runs `CREATE EXTENSION IF NOT EXISTS vector` before creating `resources`, and all domain tables exist afterward


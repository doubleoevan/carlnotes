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

A Resource SHALL have a nullable pgvector `embedding` column of 1024 dimensions and a nullable `embedding_model` column recording the vector space — the model and its dimension — that produced it. Both are null at ingestion and populated when the pipeline embeds the Resource. A model swap at the same dimension SHALL remain a backfill; a change to the embedding dimension SHALL be a schema migration that nulls the column before the `ALTER`, plus a re-embed backfill, since stored vectors of the old width cannot cast in place.

#### Scenario: Ingestion inserts before embedding
- **WHEN** a resource is first ingested by an ingester
- **THEN** the row is valid with `embedding` and `embedding_model` null

#### Scenario: Embedding and its provenance are stored
- **WHEN** the pipeline embeds a resource
- **THEN** the row stores a 1024-dimension vector `embedding` and the `embedding_model` string identifying the model and dimension that produced it

#### Scenario: A dimension change is a migration plus a backfill
- **WHEN** the embedding model's dimension changes
- **THEN** a schema migration nulls `embedding` and `embedding_model` and alters the column to the new dimension, and a backfill re-embeds the existing Resources

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

### Requirement: Attachment is topic-scoped context material

The schema SHALL define an `attachments` table: a topic-scoped entity that references `topics.id` and cascades on Topic delete. Each row SHALL store the object-storage key of the uploaded file, its original filename, content type, and byte size, and a `context` text column holding the context generated from the file that scans read. `context` SHALL be non-null (defaulting to empty) and is filled by the processing workflow when the attachment becomes `ready`. Each row SHALL carry a `status` from {pending, ready, failed}, a nullable `error` recording a processing failure, and nullable `char_count` and `chunk_count` integers recording the extracted length and fan-out. Each row SHALL also have a nullable `sourceUrl` text column recording the URL an attachment was fetched from: null for file uploads, the origin URL for URL-ingested attachments. The entity name SHALL be singular (`Attachment`) in code and plural (`attachments`) as the table, and SHALL NOT be any rejected domain noun.

#### Scenario: Attachment references its topic and cascades

- **WHEN** an attachment row is created and its Topic is later deleted
- **THEN** the attachment references `topics.id` and is deleted with the Topic

#### Scenario: Attachment stores its object key and context

- **WHEN** an attachment is persisted after upload
- **THEN** its row holds the object-storage key, the original filename, content type, and byte size, and a non-null `context`

#### Scenario: Attachment carries a processing status

- **WHEN** an attachment is first ingested
- **THEN** its row is valid with `status` = `pending`, `error` null, and `context` empty until the workflow fills it and sets `status` = `ready`

#### Scenario: Attachment records its origin URL when fetched from one

- **WHEN** an attachment is ingested from a URL rather than uploaded bytes
- **THEN** its row's `sourceUrl` holds that URL, and a file-uploaded attachment's `sourceUrl` is null

### Requirement: Resource carries a native snippet and fetched content

A Resource SHALL have a nullable `snippet` column holding the ingester-native text (the description/selftext/highlights the Source's own API returns), which stays in Postgres because every list path reads it. The full page content fetched during curation SHALL live in object storage rather than in a Postgres column, referenced by a nullable `content_key` text column and sized by a nullable `content_bytes` integer. All three are pipeline-filled and MAY be null: an ingester populates `snippet` and leaves the content columns unset; curation writes the fetched markdown to object storage and sets `content_key` and `content_bytes`. None of the three is required for a Resource row to be valid. Until a follow-up migration drops it, a legacy `content` column MAY remain present but unread and unwritten.

#### Scenario: Ingestion inserts with a snippet and no content

- **WHEN** an ingester emits a Resource
- **THEN** the row is valid with `snippet` set to the ingester-native text and `content_key`/`content_bytes` null

#### Scenario: Curation stores fetched content

- **WHEN** curation fetches a survivor's page
- **THEN** the fetched markdown is written to object storage and the row stores its `content_key` and `content_bytes`, leaving `snippet` intact

### Requirement: Scan records a per-stage cost breakdown

A Scan SHALL have a `stage_costs` jsonb column recording the dollar cost of each pipeline stage (at least ingestion, embedding, fetch, cheap scoring, and premium scoring). The existing `cost` column SHALL remain the total across every stage, so `stage_costs` is a breakdown of `cost`, not a replacement, and `cost` SHALL equal the sum of the buckets — ingestion included, since ingestion charges into the same Budget. `stage_costs` SHALL default to an empty object and be non-null. Because the column is `jsonb`, adding the ingestion bucket needs no migration.

#### Scenario: A scan records per-stage costs summing to its total

- **WHEN** a scan completes curation
- **THEN** its `stage_costs` holds each stage's dollar cost including `ingestion`, and its `cost` equals the sum of those buckets

#### Scenario: An ingestion-only scan records its ingestion bucket

- **WHEN** a scan finds no Resources to curate but its Sources charged for their searches
- **THEN** `stage_costs` holds the `ingestion` bucket and `cost` equals it

### Requirement: Topic carries filter tags

The `topics` table SHALL have a `tags` `text[]` column, non-null and defaulting to the empty array, holding free-form labels used as Topic metadata for feed filtering and directory categories. A GIN index SHALL cover `topics.tags` so containment and overlap filters (`@>`, `&&`) stay index-backed. Tags SHALL be plain Topic metadata, not a domain entity: no `tags` table and no tag join table SHALL exist, and no rejected domain noun SHALL be introduced. Resources and Findings SHALL remain untagged.

#### Scenario: A new topic defaults to an empty tag set

- **WHEN** a topic row is created without specifying tags
- **THEN** its `tags` is a non-null empty array, requiring no backfill for existing rows

#### Scenario: Tag filters are index-backed

- **WHEN** the schema and migration are inspected
- **THEN** a GIN index covers `topics.tags`, so a containment or overlap filter on tags can use it

#### Scenario: Tags are metadata, not an entity

- **WHEN** the schema and migration are inspected
- **THEN** no `tags` table or tag join table exists, and neither `resources` nor `findings` has a tags column

### Requirement: Consumed state is a per-user record, not a Finding column
The schema SHALL record consumed state in a `consumptions` table rather than on `findings`, so a user's read state is private to that user. Each row SHALL reference a `users` row and a `findings` row and cascade on delete of either, and `(user_id, finding_id)` MUST be unique so a Finding is consumed at most once per user. A row's presence means the Finding is consumed for that user; unmarking SHALL delete the row. No consumed or seen column SHALL be added to `findings`.

#### Scenario: A consumption references a user and a finding uniquely
- **WHEN** a user marks a Finding consumed twice
- **THEN** exactly one `consumptions` row exists for that (user, Finding), and it is deleted if either the user or the Finding is deleted

#### Scenario: Consumed state stays off the Finding
- **WHEN** the schema is inspected
- **THEN** `findings` has no consumed or seen column, and consumed state lives only in `consumptions`

### Requirement: The change includes the consumptions migration
The change SHALL include a generated Drizzle migration that creates the `consumptions` table with its foreign keys and its `(user_id, finding_id)` unique constraint. Applying it to a database at the current schema MUST succeed without altering any other table.

#### Scenario: Migration adds only the consumptions table
- **WHEN** the generated migration is applied to a database at the current schema
- **THEN** the `consumptions` table and its `(user_id, finding_id)` unique constraint exist and no other table is modified

### Requirement: Better Auth's sign-in tables persist alongside the domain schema
The schema SHALL define `sessions`, `accounts`, and `verifications` tables shaped to Better Auth's Drizzle adapter conventions, using the same plural-table naming as the existing `users` table. These tables SHALL be treated as sign-in identity infrastructure, not content-domain entities: they are exempt from the domain noun list the same way `users` already is.

#### Scenario: Schema exposes the Better Auth tables
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a Drizzle table for each of `sessions`, `accounts`, and `verifications`, named consistently with the plural `users` table

### Requirement: A user's LiteLLM virtual key is stored on the user row
The `users` table SHALL carry a nullable column recording the user's provisioned LiteLLM virtual key. The column SHALL only ever be null before signup completes; a fully created user row SHALL always carry a non-null key.

#### Scenario: A created user always has a key
- **WHEN** a `users` row exists that was created through the signup flow
- **THEN** its LiteLLM virtual key column is non-null

### Requirement: Better Auth's `accounts` table is distinct from Integration
`accounts` (Better Auth-managed) SHALL represent only sign-in identity: the credential or OAuth grant a user authenticates with. The existing `Integration` entity SHALL remain the sole representation of a connected external account used for sourcing or delivery (e.g. Composio-managed Gmail). Neither SHALL substitute for the other: a Source or Subscription MUST NOT resolve credentials through `accounts`, and sign-in MUST NOT be implemented through `integrations`.

#### Scenario: A source's credentials never reference accounts
- **WHEN** a Source with credentials is inspected
- **THEN** it resolves them through `integration_id`, never through the `accounts` table

#### Scenario: Sign-in never reads Integration
- **WHEN** a user authenticates via password or OAuth
- **THEN** the session is established through Better Auth's `users`/`accounts`/`sessions` tables, and no `integrations` row is read or written

### Requirement: Topic invites are rows keyed by topic and email
The schema SHALL record invite-visibility access in a `topic_invites` table: `topic_id` referencing `topics` with cascade delete, the invited `email`, and an `invited_at` timestamp. `(topic_id, email)` SHALL be the composite primary key so re-inviting the same email is a no-op. Invites reference emails, not user rows, so a Topic can be shared with someone before they have an account. An invite row SHALL grant topic-page view access and stand as a pending subscription offer: a matching-email user with no subscription row on the Topic holds a pending invite, and no subscription exists until they accept. A Subscription row's `created_at` SHALL be its activation time — rows are created at self-subscribe or invite acceptance — and the invite-topic Finding visibility gate compares Scan start times against it.

#### Scenario: An invite is unique per topic and email and follows its topic
- **WHEN** the same email is invited to a Topic twice and the Topic is later deleted
- **THEN** exactly one invite row existed for that pair, and deleting the Topic removed it

#### Scenario: Pending needs no schema of its own
- **WHEN** an invited email's user has no subscription row on the Topic
- **THEN** that state is the pending invite, and accepting creates the subscription row whose `created_at` is the activation time

### Requirement: Scans carry a manual marker
The `scans` table SHALL carry an `is_manual` boolean, not null, default false. Manually triggered Scans set it true, and scheduled and seeded Scans keep the default. The marker is bookkeeping that records which Scans an owner triggered. It is not a quota input: the per-user daily scan quota counts scheduled and manual runs alike.

#### Scenario: The marker defaults to false
- **WHEN** a Scan row is inserted without the marker
- **THEN** `is_manual` is false

### Requirement: Users carry a platform role
The `users` table SHALL carry a `role` column, not null, defaulting to `user`, with `admin` marking platform operators — the authority axis from the roles-and-plans decision. The column SHALL be plain text (not an enum) to match Better Auth's admin plugin shape. This role SHALL be the authority input to the `isAllowed` gate: an `admin` bypasses entitlement checks and may act on any Topic, while a non-admin's Topic authority stays its `owner_id`. Operator-only data, such as Scan spend and the admin console, SHALL be gated on this role through the gate.

#### Scenario: The role defaults to user
- **WHEN** a user row is inserted without a role
- **THEN** `role` is `user`

#### Scenario: The role drives the gate
- **WHEN** the `isAllowed` gate evaluates authority or an entitlement for a user
- **THEN** it reads this `role`, allowing an `admin` to bypass entitlement checks and override Topic authority

### Requirement: Users carry a billing plan
The `users` table SHALL carry a `plan` column, not null, defaulting to `free`, backed by a `plan` enum of `free`, `plus`, and `premium` — the entitlement axis from the roles-and-plans decision. The plan SHALL drive the per-user entitlements resolved by the gate. The column SHALL be a projection of the user's active Billing Subscription, kept in sync from Stripe webhooks: a user with no active billing subscription SHALL read `free`.

#### Scenario: The plan defaults to free
- **WHEN** a user row is inserted without a plan
- **THEN** `plan` is `free`

#### Scenario: The plan projects the active billing subscription
- **WHEN** a user's active Billing Subscription changes or is cleared
- **THEN** the webhook updates `users.plan` to the derived plan, `free` when no active row remains

### Requirement: The change includes its migrations
The change SHALL include generated Drizzle migrations that create `topic_invites` with its composite primary key and cascade, add `is_manual` to `scans` with its default, add `role` to `users` with its default, and add the `plan` enum and `plan` column to `users` with its default. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: The migrations are additive
- **WHEN** the generated migrations are applied to a database at the current schema
- **THEN** only `topic_invites`, the `scans.is_manual` column, and the `users.role` and `users.plan` columns are added

### Requirement: Resource records content freshness and revalidation validators

A Resource SHALL record when its content was last fetched in a non-null `fetched_at` timestamp (defaulting to row creation) that drives content-reuse decisions, and SHALL carry two nullable text columns, `etag` and `last_modified`, holding the origin validators captured at fetch time for conditional revalidation. Both validator columns MAY be null — at ingestion, and whenever a fetch does not expose them — and a null validator SHALL simply mean revalidation is skipped for that Resource. Neither validator column is required for a Resource row to be valid.

#### Scenario: Ingestion leaves validators null and fetched_at at creation

- **WHEN** an ingester first ingests a Resource
- **THEN** the row is valid with `etag` and `last_modified` null and `fetched_at` defaulted to the row's creation time

#### Scenario: A fetch that exposes validators stores them

- **WHEN** curation fetches a Resource and the response exposes an `etag` or `last_modified`
- **THEN** the row stores those validators and refreshes `fetched_at`

#### Scenario: Null validators are valid and skip revalidation

- **WHEN** a Resource has `content` but neither `etag` nor `last_modified`
- **THEN** the row is valid and curation performs no conditional GET for it

### Requirement: Scan records fetch-outcome counts

A Scan SHALL carry three non-null integer columns — `reused`, `revalidated`, and `fetched` — each defaulting to 0, recording how many of the Scan's Resources had their content reused within the TTL, revalidated via a `304`, or freshly fetched. Their sum SHALL equal the number of Resources the Scan sent through the paid fetch-and-scoring section. The columns are additive to the existing Scan counts and do not replace `kept_count` or `filtered_count`.

#### Scenario: An ingestion-only Scan has zero fetch-outcome counts

- **WHEN** a Scan finds no Resources to send through the paid section
- **THEN** `reused`, `revalidated`, and `fetched` are all 0

#### Scenario: The counts default to zero

- **WHEN** a Scan row is inserted without specifying the fetch-outcome counts
- **THEN** `reused`, `revalidated`, and `fetched` are each 0

### Requirement: The change includes the fetch-reuse migration

The change SHALL include a generated Drizzle migration that adds nullable `etag` and `last_modified` to `resources` and the non-null-defaulted `reused`, `revalidated`, and `fetched` integer columns to `scans`. Applying it to a database at the current schema MUST succeed without altering any other table, and MUST require no backfill — existing `resources` read as null validators and existing `scans` as zero counts.

#### Scenario: The migration is additive and backfill-free

- **WHEN** the generated migration is applied to a database at the current schema
- **THEN** only `resources.etag`, `resources.last_modified`, and the `scans.reused`/`scans.revalidated`/`scans.fetched` columns are added, no other table is altered, and no data backfill is needed

### Requirement: The change includes the content-offload migration and backfill

The change SHALL include a generated Drizzle migration that adds nullable `content_key` and `content_bytes` to `resources`, adds `status` (from {pending, ready, failed}), nullable `error`, and nullable `char_count` and `chunk_count` to `attachments`, and sets existing `attachments` rows to `ready` (they already carry a generated context). It SHALL include a backfill that, for each Resource that has `content` and no `content_key`, uploads that content to object storage and writes its `content_key` and `content_bytes`; the backfill SHALL be idempotent, skipping any Resource that already has a `content_key`, so it can be re-run. The migration SHALL NOT drop `resources.content`; a follow-up migration removes it once the backfill is verified in production.

#### Scenario: The migration is additive and marks existing attachments ready

- **WHEN** the migration is applied to a database at the current schema
- **THEN** `resources` gains `content_key` and `content_bytes`, `attachments` gains `status`/`error`/`char_count`/`chunk_count`, existing attachments are `ready`, and `resources.content` is not dropped

#### Scenario: The backfill uploads content and is idempotent

- **WHEN** the backfill runs and then is re-run
- **THEN** each Resource with `content` and no key has its content uploaded and `content_key`/`content_bytes` set on the first run, and Resources that already have a `content_key` are skipped on the re-run

### Requirement: Topic carries a constrained max-results count
The `topics` table SHALL carry a `max_results` integer, not null, defaulting to 10, constrained by a database check to one of 5, 10, 15, or 20. It is the size of the topic's auto-kept Finding set.

#### Scenario: The default is ten
- **WHEN** a topic row is inserted without a max-results value
- **THEN** `max_results` is 10

#### Scenario: An out-of-range value is refused
- **WHEN** a write attempts a `max_results` outside 5, 10, 15, or 20
- **THEN** the database rejects it

### Requirement: Bookmarks are per-user rows mirroring consumptions
The schema SHALL define a `bookmarks` table: the user (cascade delete), the finding (cascade delete), and a created timestamp, unique per user and finding. Bookmark state SHALL never be a `findings` column.

#### Scenario: The schema exposes bookmarks
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a `bookmarks` table with the user and finding references, their cascades, and the per-pair uniqueness

### Requirement: Resource carries an optional engagement signal
The `resources` table SHALL carry a nullable `engagement` integer holding the source's engagement count where an ingester captured one, such as a reddit post score. Null means no signal was captured.

#### Scenario: Engagement defaults to null
- **WHEN** a Resource is inserted by an ingester that captures no signal
- **THEN** `engagement` is null

### Requirement: The change includes the max-results, bookmarks, and engagement migrations
The change SHALL include generated Drizzle migrations that add `topics.max_results` with its default and check, backfill existing topics to 10, create `bookmarks`, and add `resources.engagement`. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: Existing topics backfill to ten
- **WHEN** the migrations run against a database with existing topics
- **THEN** every existing topic's `max_results` is 10 and no other table changes

### Requirement: Billing Subscription is a Stripe-backed row distinct from the topic Subscription
The schema SHALL define a `billing_subscriptions` table carrying the owning user (cascade on delete), the Stripe customer id, the Stripe subscription id, the plan, the subscription status, and the current period end, with timestamps. It SHALL model at most one active row per user and SHALL be distinct from the topic `subscriptions` table (subscriber ↔ Topic): the two SHALL never be conflated in schema or code.

#### Scenario: The schema exposes billing_subscriptions
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a `billing_subscriptions` Drizzle table with the user, Stripe customer id, Stripe subscription id, plan, status, and current period end

#### Scenario: Billing Subscription is not the topic Subscription
- **WHEN** the two tables are inspected
- **THEN** `billing_subscriptions` carries Stripe billing state while `subscriptions` carries the topic subscriber join, and neither references the other

### Requirement: Users carry a per-user budget override
The `users` table SHALL carry a nullable `budget_override_cents` column. When null, the user's effective monthly budget SHALL be their plan's monthly backstop; when set, the override SHALL take precedence in both directions. The effective budget SHALL be what the user's LiteLLM key budget is provisioned and resized to.

#### Scenario: A null override means the plan value
- **WHEN** `budget_override_cents` is null
- **THEN** the effective budget is the plan's monthly backstop

#### Scenario: A set override takes precedence
- **WHEN** `budget_override_cents` holds a value
- **THEN** the effective budget is that value, whether above or below the plan backstop

### Requirement: The change includes the authorization and billing migrations
The change SHALL include generated Drizzle migrations that create `billing_subscriptions` with its user cascade and add `budget_override_cents` to `users`. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: The migrations are additive
- **WHEN** the generated migrations are applied to a database at the current schema
- **THEN** only the `billing_subscriptions` table and the `users.budget_override_cents` column are added

### Requirement: The Resource embedding column carries an HNSW cosine index

`resources.embedding` SHALL carry an HNSW index using the `vector_cosine_ops` operator class, so the near-duplicate lookup is an index walk rather than a sequential scan plus a full sort over the globally-scoped Resource table. pgvector supports HNSW up to 2000 dimensions and the column is 1024, so the column indexes without a width change. The index SHALL be created by a migration run after the embedding backfill has populated the column, since an index over a mostly-null column measures nothing.

#### Scenario: The nearest-neighbour lookup uses the index

- **WHEN** the near-duplicate query runs against a populated Resource table
- **THEN** its plan uses the HNSW index rather than a sequential scan and sort

#### Scenario: The index is created after the backfill

- **WHEN** the change's migrations are applied
- **THEN** the index migration runs after embeddings are populated, and creating it does not require altering the column's dimension


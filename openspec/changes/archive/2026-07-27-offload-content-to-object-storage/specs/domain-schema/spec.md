## ADDED Requirements

### Requirement: The change includes the content-offload migration and backfill

The change SHALL include a generated Drizzle migration that adds nullable `content_key` and `content_bytes` to `resources`, adds `status` (from {pending, ready, failed}), nullable `error`, and nullable `char_count` and `chunk_count` to `attachments`, and sets existing `attachments` rows to `ready` (they already carry a generated context). It SHALL include a backfill that, for each Resource that has `content` and no `content_key`, uploads that content to object storage and writes its `content_key` and `content_bytes`; the backfill SHALL be idempotent, skipping any Resource that already has a `content_key`, so it can be re-run. The migration SHALL NOT drop `resources.content`; a follow-up migration removes it once the backfill is verified in production.

#### Scenario: The migration is additive and marks existing attachments ready

- **WHEN** the migration is applied to a database at the current schema
- **THEN** `resources` gains `content_key` and `content_bytes`, `attachments` gains `status`/`error`/`char_count`/`chunk_count`, existing attachments are `ready`, and `resources.content` is not dropped

#### Scenario: The backfill uploads content and is idempotent

- **WHEN** the backfill runs and then is re-run
- **THEN** each Resource with `content` and no key has its content uploaded and `content_key`/`content_bytes` set on the first run, and Resources that already have a `content_key` are skipped on the re-run

## MODIFIED Requirements

### Requirement: Resource carries a native snippet and fetched content

A Resource SHALL have a nullable `snippet` column holding the adapter-native text (the description/selftext/highlights the Source's own API returns), which stays in Postgres because every list path reads it. The full page content fetched during curation SHALL live in object storage rather than in a Postgres column, referenced by a nullable `content_key` text column and sized by a nullable `content_bytes` integer. All three are pipeline-filled and MAY be null: an adapter populates `snippet` and leaves the content columns unset; curation writes the fetched markdown to object storage and sets `content_key` and `content_bytes`. None of the three is required for a Resource row to be valid. Until a follow-up migration drops it, a legacy `content` column MAY remain present but unread and unwritten.

#### Scenario: Ingestion inserts with a snippet and no content

- **WHEN** an adapter emits a Resource
- **THEN** the row is valid with `snippet` set to the adapter-native text and `content_key`/`content_bytes` null

#### Scenario: Curation stores fetched content

- **WHEN** curation fetches a survivor's page
- **THEN** the fetched markdown is written to object storage and the row stores its `content_key` and `content_bytes`, leaving `snippet` intact

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

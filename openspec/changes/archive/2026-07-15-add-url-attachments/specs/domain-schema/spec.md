## MODIFIED Requirements

### Requirement: Attachment is topic-scoped context material

The schema SHALL define an `attachments` table: a topic-scoped entity that references `topics.id` and cascades on Topic delete. Each row SHALL store the object-storage key of the uploaded file, its original filename, content type, and byte size, and a `context` text column holding the context generated from the file that scans read. `context` SHALL be non-null (defaulting to empty). Each row SHALL also have a nullable `sourceUrl` text column recording the URL an attachment was fetched from: null for file uploads, the origin URL for URL-ingested attachments. The entity name SHALL be singular (`Attachment`) in code and plural (`attachments`) as the table, and SHALL NOT be any rejected domain noun.

#### Scenario: Attachment references its topic and cascades

- **WHEN** an attachment row is created and its Topic is later deleted
- **THEN** the attachment references `topics.id` and is deleted with the Topic

#### Scenario: Attachment stores its object key and context

- **WHEN** an attachment is persisted after upload
- **THEN** its row holds the object-storage key, the original filename, content type, and byte size, and a non-null `context`

#### Scenario: Attachment records its origin URL when fetched from one

- **WHEN** an attachment is ingested from a URL rather than uploaded bytes
- **THEN** its row's `sourceUrl` holds that URL, and a file-uploaded attachment's `sourceUrl` is null

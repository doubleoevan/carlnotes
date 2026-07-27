## ADDED Requirements

### Requirement: Ingestion stores the file synchronously, then processes it in a durable workflow

Ingesting an attachment SHALL run in two parts. The synchronous part SHALL validate size, content type, and Topic, store the raw bytes in object storage, insert the attachment row with `status` = `pending`, start the processing workflow, and return the `pending` row — it SHALL NOT extract text or call the model. The asynchronous part SHALL be a durable Temporal workflow that processes the stored file and drives the attachment to `ready` or `failed`. The api SHALL return the `pending` attachment immediately rather than blocking on processing.

#### Scenario: Upload returns a pending attachment and starts the workflow

- **WHEN** an attachment is ingested
- **THEN** its bytes are stored, a row is inserted with `status` = `pending`, the processing workflow is started, and the `pending` row is returned without waiting for extraction or the model

#### Scenario: A synchronous validation failure stores nothing and starts nothing

- **WHEN** the size, content type, or Topic check fails
- **THEN** ingestion fails, no bytes are stored, no row is inserted, and no workflow is started

### Requirement: Processing chunks a long document and merges bounded parallel summaries

The processing workflow SHALL extract the stored file's full text, split it into at most `MAX_CHUNKS` chunks, summarize each chunk in a parallel activity, and merge the chunk summaries into one context string bounded by a maximum output length. It SHALL record `char_count` (the extracted text length) and `chunk_count` (the number of chunks) on the attachment. Because the whole document is chunked rather than truncated to a single cap, a long document's later content is represented in the context. The workflow SHALL be durable: an interrupted run resumes rather than stranding a half-processed attachment.

#### Scenario: A long document is chunked, summarized in parallel, and merged

- **WHEN** the workflow processes an attachment whose extracted text exceeds one chunk
- **THEN** the text is split into at most `MAX_CHUNKS` chunks, each is summarized in its own activity, and the summaries are merged into one context bounded by the maximum output length

#### Scenario: Fan-out is bounded

- **WHEN** an extracted document would split into more than `MAX_CHUNKS` chunks
- **THEN** no more than `MAX_CHUNKS` chunks are summarized

#### Scenario: Counts are recorded

- **WHEN** processing finishes
- **THEN** the attachment's `char_count` and `chunk_count` reflect the extracted length and the number of chunks

## RENAMED Requirements

- FROM: `### Requirement: Context is generated once, at upload`
- TO: `### Requirement: Context is generated once by the processing workflow`
- FROM: `### Requirement: A failed extraction or context step leaves no attachment and no orphan`
- TO: `### Requirement: A failed attachment leaves no orphan and never feeds a scan`

## MODIFIED Requirements

### Requirement: Context is generated once by the processing workflow

An attachment's context SHALL be generated after upload by the durable processing workflow, exactly once, not synchronously in the request. The workflow SHALL persist the merged context to the attachment's `context` column and set `status` = `ready`. A Scan SHALL read the stored context of `ready` attachments and SHALL NOT re-extract or re-run the model over the raw file.

#### Scenario: Context is produced and stored at upload

- **WHEN** an attachment is ingested and its processing workflow finishes
- **THEN** its file's text is extracted and reduced to a context string once, and that context is written to the attachment's `context` column as its `status` becomes `ready`

#### Scenario: Scans read the stored context, not the raw file

- **WHEN** a Topic with a `ready` attachment is scanned
- **THEN** the scan reads the persisted context and does not re-open, re-extract, or re-run the model over the raw file

### Requirement: A Topic's scan context includes its attachments' contexts

A Scan SHALL treat a Topic's effective context as the Topic's own `context` together with the `context` of each of the Topic's **`ready`** attachments. A `pending` or `failed` attachment SHALL contribute no context, so a scan never reads a half-built or empty context as though it were real. A Topic with no `ready` attachments SHALL use its own `context` alone.

#### Scenario: Attachment context feeds the scan context

- **WHEN** a Topic has a `ready` attachment and a `pending` one and is scanned
- **THEN** the effective context contains the Topic's `context` and the `ready` attachment's `context`, and nothing from the `pending` one

#### Scenario: No attachments leaves context unchanged

- **WHEN** a Topic has no `ready` attachments
- **THEN** the effective context is exactly the Topic's own `context`

### Requirement: A failed attachment leaves no orphan and never feeds a scan

Ingestion and processing fail in two different places, and each cleans up after itself. If the synchronous half fails — storing the bytes, inserting the row, or starting the workflow — ingestion SHALL leave no attachment row and SHALL best-effort delete any stored object. If processing fails — extraction, summarization, or the merge — the workflow SHALL set the attachment's `status` = `failed`, record the reason in `error`, and its compensation SHALL best-effort delete the stored object, so the failure is visible to the owner as a `failed` row rather than vanishing. Either way no orphaned object remains, and a `failed` attachment SHALL never contribute context to a Scan.

#### Scenario: A failure leaves no attachment

- **WHEN** storing the file, inserting the row, or starting the workflow fails during synchronous ingestion
- **THEN** no attachment row remains and the Topic's scan context is unaffected

#### Scenario: A failure after storage deletes the stored object

- **WHEN** synchronous ingestion fails after the file was written to object storage, or the processing workflow fails
- **THEN** the stored object is best-effort deleted, leaving no orphan

#### Scenario: A processing failure marks the attachment failed and deletes the object

- **WHEN** extraction, summarization, or the merge throws in the workflow
- **THEN** the attachment's `status` becomes `failed` with the reason in `error`, its stored object is best-effort deleted, and no scan reads its context

#### Scenario: A failed attachment is excluded from scans

- **WHEN** a Topic has only a `failed` attachment
- **THEN** its context is not part of the Topic's effective scan context

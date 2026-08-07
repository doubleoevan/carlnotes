# topic-attachments Specification

## Purpose
TBD - created by archiving change add-topic-attachments. Update Purpose after archive.
## Requirements
### Requirement: Topic file is stored in object storage via a configurable S3 endpoint

Ingesting an attachment SHALL upload the raw file bytes to the configured object-storage bucket through an S3-compatible client whose endpoint, region, bucket, and credentials are read from `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. The object key SHALL be unique per attachment and SHALL be stored on the attachment row so the raw file can be retrieved later. When any required `S3_*` value is missing, ingestion SHALL fail rather than silently default to a public or wrong endpoint.

#### Scenario: File is uploaded to the configured bucket

- **WHEN** an attachment is ingested for a Topic
- **THEN** its bytes are written to the bucket named by `S3_BUCKET` at the endpoint named by `S3_ENDPOINT`, and the resulting object key is stored on the attachment row

#### Scenario: Endpoint is configuration, not code

- **WHEN** `S3_ENDPOINT` points at Cloudflare R2, MinIO, or AWS S3
- **THEN** the same ingestion code targets that backend with no code change

#### Scenario: Missing storage configuration fails ingestion

- **WHEN** a required `S3_*` value is unset and an attachment is ingested
- **THEN** ingestion fails with an error and no attachment row is created

### Requirement: Extraction supports text and PDF; other types are rejected

Extraction SHALL decode `text/*` and markdown files directly as UTF-8 and SHALL extract text from PDF files. A file whose content type is neither text nor PDF SHALL be rejected at upload with an error, and no attachment SHALL be stored for it.

#### Scenario: Text and markdown are decoded

- **WHEN** a `text/plain` or `text/markdown` file is ingested
- **THEN** its bytes are decoded to text and passed to context generation

#### Scenario: PDF text is extracted

- **WHEN** an `application/pdf` file is ingested
- **THEN** its text content is extracted and passed to context generation

#### Scenario: Unsupported type is rejected

- **WHEN** a file whose content type is neither text nor PDF is ingested
- **THEN** ingestion fails with an error and no attachment row is created

### Requirement: Upload validates input at the trust boundary

Ingesting an attachment SHALL, before storing it or running the model, reject a file larger than a bounded maximum size and reject an upload whose Topic does not exist, so a hostile, oversized, or misaddressed upload cannot consume storage or inference cost.

#### Scenario: Oversized file is rejected before storage

- **WHEN** a file exceeding the maximum size is ingested
- **THEN** ingestion fails with an error, nothing is written to object storage, and the model is not called

#### Scenario: Upload to a nonexistent topic is rejected before storage

- **WHEN** an attachment is ingested for a topic id that does not exist
- **THEN** ingestion fails with an error before any object is stored or the model is called

### Requirement: A Topic's scan context includes its attachments' contexts

A Scan SHALL treat a Topic's effective context as the Topic's own `context` together with the `context` of each of the Topic's **`ready`** attachments. A `pending` or `failed` attachment SHALL contribute no context, so a scan never reads a half-built or empty context as though it were real. A Topic with no `ready` attachments SHALL use its own `context` alone.

#### Scenario: Attachment context feeds the scan context

- **WHEN** a Topic has a `ready` attachment and a `pending` one and is scanned
- **THEN** the effective context contains the Topic's `context` and the `ready` attachment's `context`, and nothing from the `pending` one

#### Scenario: No attachments leaves context unchanged

- **WHEN** a Topic has no `ready` attachments
- **THEN** the effective context is exactly the Topic's own `context`

### Requirement: An attachment can be ingested from a URL

Ingesting an attachment from a URL SHALL fetch the page's content as markdown through the Firecrawl seam (`worker/scrape.ts`), wrap the result as a `text/markdown` upload, and pass it through the same ingestion path as a file upload — the extraction, context generation, storage, persistence, and failure/orphan cleanup are reused unchanged. The URL SHALL be validated as a well-formed `http`/`https` URL, and rejected if it resolves to an internal address, before any fetch is attempted. A fetch that fails (network error, missing `FIRECRAWL_API_KEY`, or non-ok response) or returns empty content SHALL fail ingestion before anything is stored, so no contextless attachment is ever persisted. The originating URL SHALL be recorded on the attachment's `sourceUrl` column.

The fetched markdown SHALL be screened as a document before its context is generated, on the same terms as an uploaded file's extracted text, so a url attachment and a url Source cannot disagree about what is fit to read.

This is a one-time context read at attach time, not a Source: it does not create a Scan, Resource, or Finding, and does not change `generateContext` or a Topic's scan context.

#### Scenario: A URL page is fetched and stored as an attachment

- **WHEN** an attachment is ingested for a Topic from a valid `http(s)` URL whose page fetches to non-empty markdown
- **THEN** the page markdown is extracted and reduced to a context string, an attachment row is persisted with its `context` and with `sourceUrl` set to the fetched URL, and the raw markdown is stored in object storage

#### Scenario: URL ingestion reuses the file ingestion path

- **WHEN** the fetched markdown is wrapped as a `text/markdown` upload
- **THEN** it flows through the same size validation, topic-existence check, extraction, screening, context generation, storage, and orphan-cleanup as a file upload, with no separate ingestion code path

#### Scenario: A malformed URL is rejected before any fetch

- **WHEN** an attachment is ingested from a value that is not a well-formed `http`/`https` URL, or from one that resolves to an internal address
- **THEN** ingestion fails with an error before Firecrawl is called, and no object is stored and no row is created

#### Scenario: An empty or failed fetch stores no attachment

- **WHEN** the Firecrawl fetch throws or returns empty content for the URL
- **THEN** ingestion fails with an error, no attachment row is created, and nothing is left in object storage

#### Scenario: A flagged page is rejected

- **WHEN** the scanner flags the fetched markdown as a document
- **THEN** the attachment fails with the flagged reason and its context is never generated

#### Scenario: File uploads carry no source URL

- **WHEN** an attachment is ingested from uploaded file bytes rather than a URL
- **THEN** its `sourceUrl` is null, and the file-upload behavior is otherwise unchanged

### Requirement: Context is generated once by the processing workflow

An attachment's context SHALL be generated after upload by the durable processing workflow, exactly once, not synchronously in the request. The workflow SHALL persist the merged context to the attachment's `context` column and set `status` = `ready`. A Scan SHALL read the stored context of `ready` attachments and SHALL NOT re-extract or re-run the model over the raw file.

Because that one generated context is merged into every later Scan for the Topic, it SHALL be readable and editable by the Topic's owner, and a saved edit SHALL replace the stored context that later Scans read. An edit SHALL NOT trigger regeneration — the edit is the correction.

#### Scenario: Context is produced and stored at upload

- **WHEN** an attachment is ingested and its processing workflow finishes
- **THEN** its file's text is extracted and reduced to a context string once, and that context is written to the attachment's `context` column as its `status` becomes `ready`

#### Scenario: Scans read the stored context, not the raw file

- **WHEN** a Topic with a `ready` attachment is scanned
- **THEN** the scan reads the persisted context and does not re-open, re-extract, or re-run the model over the raw file

#### Scenario: An owner's edit becomes the context later Scans read

- **WHEN** the owner edits a `ready` attachment's context and saves
- **THEN** the stored `context` is replaced by the edited text, no regeneration runs, and the Topic's next Scan builds its effective context from the edited text

### Requirement: A failed attachment leaves no orphan and never feeds a scan

Ingestion and processing fail in two different places, and each cleans up after itself. If the synchronous half fails — storing the bytes, inserting the row, or starting the workflow — ingestion SHALL leave no attachment row and SHALL best-effort delete any stored object. If processing fails — extraction, summarization, the merge, or a scanner detection on the extracted text — the workflow SHALL set the attachment's `status` = `failed`, record the reason in `error`, and its compensation SHALL best-effort delete the stored object, so the failure is visible to the owner as a `failed` row rather than vanishing. Either way no orphaned object remains, and a `failed` attachment SHALL never contribute context to a Scan.

#### Scenario: A failure leaves no attachment

- **WHEN** storing the file, inserting the row, or starting the workflow fails during synchronous ingestion
- **THEN** no attachment row remains and the Topic's scan context is unaffected

#### Scenario: A failure after storage deletes the stored object

- **WHEN** synchronous ingestion fails after the file was written to object storage, or the processing workflow fails
- **THEN** the stored object is best-effort deleted, leaving no orphan

#### Scenario: A processing failure marks the attachment failed and deletes the object

- **WHEN** extraction, summarization, or the merge throws in the workflow
- **THEN** the attachment's `status` becomes `failed` with the reason in `error`, its stored object is best-effort deleted, and no scan reads its context

#### Scenario: Scanner-flagged text fails the attachment with a visible reason

- **WHEN** the scanner flags an attachment's extracted text before context generation
- **THEN** no context is generated, the attachment's `status` becomes `failed` with the scanner's reason in `error` for the owner to see, and its context never reaches a Scan

#### Scenario: A failed attachment is excluded from scans

- **WHEN** a Topic has only a `failed` attachment
- **THEN** its context is not part of the Topic's effective scan context

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

### Requirement: A pending attachment's origin url is not a live link

An attachment whose processing has not finished SHALL NOT render its origin url as a clickable link. Its url has been fetched but its screening verdict is not yet known, so offering it to a reader offers exactly the link that screening exists to withhold. A pending attachment SHALL read as its label with a processing marker, and become a link only once it is ready.

#### Scenario: A pending url attachment

- **WHEN** a Topic carrying a url attachment that is still processing is viewed
- **THEN** its url renders as plain text with a processing marker rather than as a link

#### Scenario: A ready url attachment

- **WHEN** the same attachment has finished processing
- **THEN** its url renders as a link to the origin page, as before


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

### Requirement: Context is generated once, at upload

Ingesting an attachment SHALL extract the file's text and generate a context string from it using the cheap-tier model through the LiteLLM proxy (the `worker/llm.ts` seam), exactly once, at upload time. The resulting context SHALL be persisted in the attachment's `context` column. A Scan SHALL NOT re-extract or re-run the model over the file; it reads the stored context.

#### Scenario: Context is produced and stored at upload

- **WHEN** an attachment is ingested
- **THEN** its file's text is extracted and reduced to a context string once, and that context is written to the attachment's `context` column

#### Scenario: Scans read the stored context, not the raw file

- **WHEN** a Topic with an attachment is scanned
- **THEN** the scan reads the persisted context and does not re-open, re-extract, or re-run the model over the raw file

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

A Scan SHALL treat a Topic's effective context as the Topic's own `context` together with the `context` of each of the Topic's attachments. A Topic with no attachments SHALL use its own `context` alone, unchanged from prior behavior.

#### Scenario: Attachment context feeds the scan context

- **WHEN** a Topic with one or more attachments is scanned
- **THEN** the effective context read by the scan contains both the Topic's `context` and each attachment's `context`

#### Scenario: No attachments leaves context unchanged

- **WHEN** a Topic with no attachments is scanned
- **THEN** the effective context is exactly the Topic's own `context`

### Requirement: A failed extraction or context step leaves no attachment and no orphan

If extracting the file's text or generating its context fails, ingestion SHALL NOT persist an attachment row, so a scan never reads a partial or empty context as though it were real context. If the file was already stored when the failure occurred, ingestion SHALL best-effort delete the stored object so a failure leaves neither a row nor an orphaned object.

#### Scenario: A failure leaves no attachment

- **WHEN** text extraction or the context step throws while ingesting an attachment
- **THEN** no attachment row is created and the Topic's scan context is unaffected

#### Scenario: A failure after storage deletes the stored object

- **WHEN** the context step or the insert fails after the file was written to object storage
- **THEN** ingestion best-effort deletes the stored object, leaving no orphan

### Requirement: An attachment can be ingested from a URL

Ingesting an attachment from a URL SHALL fetch the page's content as markdown through the Firecrawl seam (`worker/scrape.ts`), wrap the result as a `text/markdown` upload, and pass it through the same ingestion path as a file upload — the extraction, context generation, storage, persistence, and failure/orphan cleanup are reused unchanged. The URL SHALL be validated as a well-formed `http`/`https` URL before any fetch is attempted. A fetch that fails (network error, missing `FIRECRAWL_API_KEY`, or non-ok response) or returns empty content SHALL fail ingestion before anything is stored, so no contextless attachment is ever persisted. The originating URL SHALL be recorded on the attachment's `sourceUrl` column.

This is a one-time context read at attach time, not a Source: it does not create a Scan, Resource, or Finding, and does not change `generateContext` or a Topic's scan context.

#### Scenario: A URL page is fetched and stored as an attachment

- **WHEN** an attachment is ingested for a Topic from a valid `http(s)` URL whose page fetches to non-empty markdown
- **THEN** the page markdown is extracted and reduced to a context string, an attachment row is persisted with its `context` and with `sourceUrl` set to the fetched URL, and the raw markdown is stored in object storage

#### Scenario: URL ingestion reuses the file ingestion path

- **WHEN** the fetched markdown is wrapped as a `text/markdown` upload
- **THEN** it flows through the same size validation, topic-existence check, extraction, context generation, storage, and orphan-cleanup as a file upload, with no separate ingestion code path

#### Scenario: A malformed URL is rejected before any fetch

- **WHEN** an attachment is ingested from a value that is not a well-formed `http`/`https` URL
- **THEN** ingestion fails with an error before Firecrawl is called, and no object is stored and no row is created

#### Scenario: An empty or failed fetch stores no attachment

- **WHEN** the Firecrawl fetch throws or returns empty content for the URL
- **THEN** ingestion fails with an error, no attachment row is created, and nothing is left in object storage

#### Scenario: File uploads carry no source URL

- **WHEN** an attachment is ingested from uploaded file bytes rather than a URL
- **THEN** its `sourceUrl` is null, and the file-upload behavior is otherwise unchanged


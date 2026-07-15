## ADDED Requirements

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

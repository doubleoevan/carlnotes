# Spec Delta

## MODIFIED Requirements

### Requirement: An attachment can be ingested from a URL

Ingesting an attachment from a URL SHALL fetch the page's content as markdown through the Firecrawl seam
(`packages/pipeline/scrape.ts`), wrap the result as a `text/markdown` upload, and pass it through the same ingestion
path as a file upload — the extraction, context generation, storage, persistence, and failure/orphan cleanup are
reused unchanged. The URL SHALL be validated as a well-formed `http`/`https` URL, and rejected if it resolves to an
internal address, before any fetch is attempted. A fetch that fails (network error, missing `FIRECRAWL_API_KEY`, or
non-ok response) or returns empty content SHALL fail ingestion before anything is stored, so no contextless attachment
is ever persisted. The originating URL SHALL be recorded on the attachment's `sourceUrl` column.

The fetched markdown SHALL be treated exactly as an uploaded file's extracted text, with no screen. Its text reaches
every prompt inside the nonce fence.

This is a one-time context read at attach time, not a Source: it does not create a Scan, Resource, or Finding, and does
not change `generateContext` or a Topic's scan context.

#### Scenario: A URL page is fetched and stored as an attachment

- **WHEN** an attachment is ingested for a Topic from a valid `http(s)` URL whose page fetches to non-empty markdown
- **THEN** the page markdown is extracted and reduced to a context string, an attachment row is persisted with its
  `context` and with `sourceUrl` set to the fetched URL, and the raw markdown is stored in object storage

#### Scenario: URL ingestion reuses the file ingestion path

- **WHEN** the fetched markdown is wrapped as a `text/markdown` upload
- **THEN** it flows through the same size validation, topic-existence check, extraction, context generation, storage,
  and orphan-cleanup as a file upload, with no separate ingestion code path

#### Scenario: A malformed URL is rejected before any fetch

- **WHEN** an attachment is ingested from a value that is not a well-formed `http`/`https` URL, or from one that
  resolves to an internal address
- **THEN** ingestion fails with an error before Firecrawl is called, and no object is stored and no row is created

#### Scenario: An empty or failed fetch stores no attachment

- **WHEN** the Firecrawl fetch throws or returns empty content for the URL
- **THEN** ingestion fails with an error, no attachment row is created, and nothing is left in object storage

#### Scenario: A flagged page is rejected

- **WHEN** the fetched markdown holds an instruction addressed to Carl
- **THEN** the attachment is not rejected for it, its context is generated, and the instruction reaches every prompt
  inside the fence as data

#### Scenario: File uploads carry no source URL

- **WHEN** an attachment is ingested from uploaded file bytes rather than a URL
- **THEN** its `sourceUrl` is null, and the file-upload behavior is otherwise unchanged

### Requirement: A failed attachment leaves no orphan and never feeds a scan

Ingestion and processing fail in two different places, and each cleans up after itself. Ingestion SHALL record the
attachment's key as pending before uploading, with a grace period, and SHALL clear the pending row in the transaction
that inserts the attachment row. If the synchronous half fails, whether storing the bytes, inserting the row, or
starting the workflow, ingestion SHALL leave no attachment row and SHALL delete the stored object through
`deleteStoredObject`, and a delete that fails leaves the key pending for the sweep. If processing fails, whether
extraction, summarization, or the merge, the workflow SHALL set the
attachment's `status` = `failed`, record the reason in `error`, and record the object's key as pending in that same
transaction, then delete the stored object through `deleteStoredObject`, and the failure stays visible to the owner as
a `failed` row. Either way
no orphaned object remains once the sweep has run, and a `failed` attachment SHALL never contribute context to a Scan.

#### Scenario: A failure leaves no attachment

- **WHEN** storing the file, inserting the row, or starting the workflow fails during synchronous ingestion
- **THEN** no attachment row remains and the Topic's scan context is unaffected

#### Scenario: A failure after storage deletes the stored object

- **WHEN** synchronous ingestion fails after the file was written to object storage, or the processing workflow fails
- **THEN** the stored object is deleted through `deleteStoredObject`, and a delete that fails leaves the key pending for
  the sweep

#### Scenario: A processing failure marks the attachment failed and deletes the object

- **WHEN** extraction, summarization, or the merge throws in the workflow
- **THEN** the attachment's `status` becomes `failed` with the reason in `error`, its key is recorded as pending in the
  same transaction, its stored object is deleted, and no scan reads its context

#### Scenario: Scanner-flagged text fails the attachment with a visible reason

- **WHEN** an attachment's extracted text holds what the removed scanner would have flagged
- **THEN** no scanner runs, the attachment is not failed for its content, and its context is generated

#### Scenario: A failed attachment is excluded from scans

- **WHEN** a Topic has only a `failed` attachment
- **THEN** its context is not part of the Topic's effective scan context

#### Scenario: A crash between the upload and the insert

- **WHEN** the api dies after storing the bytes and before inserting the row
- **THEN** the key is pending, and the sweep deletes the object after the grace period

### Requirement: A pending attachment's origin url is not a live link

An attachment whose processing has not finished SHALL NOT render its origin url as a clickable link. Its processing may
still fail, and a failed attachment's url is not one the product offers. A pending attachment SHALL read as its label
with a processing marker, and become a link only once it is ready.

#### Scenario: A pending url attachment

- **WHEN** a Topic carrying a url attachment that is still processing is viewed
- **THEN** its url renders as plain text with a processing marker rather than as a link

#### Scenario: A ready url attachment

- **WHEN** the same attachment has finished processing
- **THEN** its url renders as a link to the origin page, as before

### Requirement: A short document is stored as written

The processing workflow SHALL store a document's extracted text as its context, with no model call, if the
extracted text is at most `MAX_ATTACHMENT_CONTEXT_CHARS` characters, which SHALL be 20,000. The stored text SHALL be
limited to that length. Only a document whose extracted text is longer SHALL be
chunked and summarized. The same limit SHALL bound the merged summaries of a long document, a table file's whole
table text with its headings and its omitted-rows line, and an owner's edit to any attachment's context. The worker
SHALL read it from the shared contract, so the worker never stores a context that the owner can't save after an edit.

#### Scenario: A list of names reaches the scan exactly

- **WHEN** a text file listing 40 names, well under 20,000 characters, is processed
- **THEN** its stored context is the file's text with every name in it, no model is called, and its `chunk_count` is 0

#### Scenario: A long document is still summarized

- **WHEN** a document whose extracted text is longer than 20,000 characters is processed
- **THEN** it is chunked and summarized, and its merged summaries are limited to 20,000 characters

#### Scenario: An owner can save an edit to a full-length context

- **WHEN** the owner edits a 20,000-character context and saves it
- **THEN** the edit is accepted

### Requirement: A failed attachment tells its owner why

A failed attachment SHALL show its owner and admins a line that says why it failed: the file had no text, like a
scanned PDF, or, for a row recorded before the scanner was removed, the scanner flagged it. Any other failure SHALL
show that Carl couldn't read the file. The worker SHALL record the innermost error of a failed activity, never the
workflow's wrapper around it. The topic page SHALL send that line and never the recorded reason, and anyone else SHALL
see no line.

The processing workflow SHALL wait 15 and then 30 seconds between its tries, so a busy model can finish before the
attachment fails.

#### Scenario: A file with no text says so

- **WHEN** a scanned PDF with no text layer fails
- **THEN** the owner sees that Carl found no text in the file

#### Scenario: A flagged file says so

- **WHEN** an attachment that the scanner failed before its removal is viewed
- **THEN** the owner sees that Carl's safety check flagged the file, and not which detectors fired

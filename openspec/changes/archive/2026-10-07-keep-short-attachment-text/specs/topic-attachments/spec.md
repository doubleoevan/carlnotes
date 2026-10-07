## ADDED Requirements

### Requirement: A short document is stored as written

The processing workflow SHALL store a document's screened text as its context, with no model call, if the
extracted text is at most `MAX_ATTACHMENT_CONTEXT_CHARS` characters, which SHALL be 20,000. The stored text SHALL be
limited to that length, since redaction can lengthen it. Only a document whose extracted text is longer SHALL be
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
scanned PDF, or the scanner flagged it. Any other failure SHALL show that Carl couldn't read the file. The worker
SHALL record the innermost error of a failed activity, never the workflow's wrapper around it. The topic page SHALL
send that line and never the recorded reason, and anyone else SHALL see no line.

A document stored as written and a table file SHALL each give the scanner a minute to screen them, and the processing
workflow SHALL wait 15 and then 30 seconds between its tries, so a busy scanner can finish before the text is stored unscreened.

#### Scenario: A file with no text says so

- **WHEN** a scanned PDF with no text layer fails
- **THEN** the owner sees that Carl found no text in the file

#### Scenario: A flagged file says so

- **WHEN** the scanner flags an attachment's text
- **THEN** the owner sees that Carl's safety check flagged the file, and not which detectors fired

## MODIFIED Requirements

### Requirement: A Topic's scan context includes its attachments' contexts

A Scan SHALL treat a Topic's effective context as the Topic's own `context` together with the `context` of each of the
Topic's **`ready`** attachments. A `pending` or `failed` attachment SHALL contribute no context, so a scan never reads a
half-built or empty context as though it were real. A Topic with no `ready` attachments SHALL use its own `context` alone.

The score prompt and the scan summary SHALL read the Topic's name and effective context up to 24,000 characters, enough
for the prompt and one attachment at full length. The relevance gate SHALL embed the first 8,000 characters of that
text. A Finding's context hash SHALL cover the 24,000-character text, so an edit past the first 8,000 characters reviews
the Topic's Findings again, and a context of 8,000 characters or fewer keeps the hash it had.

#### Scenario: Attachment context feeds the scan context

- **WHEN** a Topic has a `ready` attachment and a `pending` one and is scanned
- **THEN** the effective context contains the Topic's `context` and the `ready` attachment's `context`, and nothing from
  the `pending` one

#### Scenario: No attachments leaves context unchanged

- **WHEN** a Topic has no `ready` attachments
- **THEN** the effective context is exactly the Topic's own `context`

#### Scenario: The score prompt reads past the embedding's limit

- **WHEN** a Topic's prompt and attachments run to 20,000 characters and a Scan scores a Resource
- **THEN** the score prompt includes all 20,000 characters, and the relevance gate embeds the first 8,000

### Requirement: Context is generated once by the processing workflow

An attachment's context SHALL be generated after upload by the durable processing workflow, exactly once, not
synchronously in the request. The workflow SHALL persist the context to the attachment's `context` column and set
`status` = `ready`. A Scan SHALL read the stored context of `ready` attachments and SHALL NOT re-extract or re-run the
model over the raw file.

Because that one generated context is merged into every later Scan for the Topic, it SHALL be readable and editable by
the Topic's owner, and a saved edit SHALL replace the stored context that later Scans read. An edit SHALL NOT trigger
regeneration — the edit is the correction.

#### Scenario: Context is produced and stored at upload

- **WHEN** an attachment is ingested and its processing workflow finishes
- **THEN** its file's text is extracted and turned into a context once, as written or summarized, and that context is
  written to the attachment's `context` column as its `status` becomes `ready`

#### Scenario: Scans read the stored context, not the raw file

- **WHEN** a Topic with a `ready` attachment is scanned
- **THEN** the scan reads the persisted context and does not re-open, re-extract, or re-run the model over the raw file

#### Scenario: An owner's edit becomes the context later Scans read

- **WHEN** the owner edits a `ready` attachment's context and saves
- **THEN** the stored `context` is replaced by the edited text, no regeneration runs, and the Topic's next Scan builds
  its effective context from the edited text

### Requirement: Processing chunks a long document and merges bounded parallel summaries

The processing workflow SHALL extract the stored file's full text, split it into at most `MAX_CHUNKS` chunks, summarize
each chunk in a parallel activity, and merge the chunk summaries into one context string bounded by
`MAX_ATTACHMENT_CONTEXT_CHARS`. It SHALL record `char_count` (the extracted text length) and `chunk_count` (the number
of chunks) on the attachment. The workflow SHALL be durable: an interrupted run resumes instead of stranding a
half-processed attachment.

Extraction is limited to `MAX_PROCESS_CHARS`, and a document longer than that is cut there. That cut SHALL be marked in
the extracted text, naming the full length, so a truncated document is summarized as a prefix instead of as the whole.
`char_count` SHALL record the full extracted length, not the length after the cut.

This requirement SHALL apply only to a document longer than `MAX_ATTACHMENT_CONTEXT_CHARS`. A shorter document is stored
as written, and a table file is written as table text. Neither is summarized, and each records a `chunk_count` of 0.

#### Scenario: A long document is chunked, summarized in parallel, and merged

- **WHEN** the workflow processes an attachment whose extracted text is longer than `MAX_ATTACHMENT_CONTEXT_CHARS`
- **THEN** the text is split into at most `MAX_CHUNKS` chunks, each is summarized in its own activity, and the summaries
  are merged into one context bounded by `MAX_ATTACHMENT_CONTEXT_CHARS`

#### Scenario: Fan-out is bounded

- **WHEN** an extracted document would split into more than `MAX_CHUNKS` chunks
- **THEN** no more than `MAX_CHUNKS` chunks are summarized

#### Scenario: A truncated document says so

- **WHEN** a document longer than `MAX_PROCESS_CHARS` is processed
- **THEN** its extracted text includes a marker naming the full length, and `char_count` records that full length

#### Scenario: Counts are recorded

- **WHEN** processing finishes
- **THEN** the attachment's `char_count` and `chunk_count` reflect the extracted length and the number of chunks

## MODIFIED Requirements

### Requirement: Extraction supports text and PDF; other types are rejected

Extraction SHALL decode `text/*` files directly, SHALL extract text from PDF files, SHALL extract plain text from DOCX files, and SHALL read XLSX files as rows. A file whose content type has no extractor SHALL be rejected at upload with an error, and no attachment SHALL be stored for it.

A `text/*` file SHALL be decoded by its declared or sniffed character set, not always as UTF-8. Excel's plain CSV export is Windows-1252, and decoding it as UTF-8 turns every accented character into a replacement character.

An uploaded `text/html` file SHALL be converted to Markdown before extraction. HTML passes the `text/` wildcard and decodes to tag soup, so an uploaded page would otherwise be summarized worse than the same page added as a URL.

The gate `isSupportedAttachmentType`, the extractor `extractText`, and the picker's `FILE_PICKER_ACCEPT` SHALL admit the same set of types. Widening the gate alone stores bytes and starts a workflow for a file that then fails; adding an extractor alone rejects a readable file at upload; widening the picker alone offers a file the boundary rejects.

#### Scenario: Text and markdown are decoded

- **WHEN** a `text/plain` or `text/markdown` file is ingested
- **THEN** its bytes are decoded to text and passed to context generation

#### Scenario: PDF text is extracted

- **WHEN** an `application/pdf` file is ingested
- **THEN** its text content is extracted and passed to context generation

#### Scenario: A DOCX is extracted as plain text

- **WHEN** a `.docx` file is ingested
- **THEN** its text content is extracted and passed to context generation

#### Scenario: An XLSX is read as rows

- **WHEN** an `.xlsx` file is ingested
- **THEN** its sheets are read as rows and passed to the table text

#### Scenario: A Windows-1252 CSV decodes without replacement characters

- **WHEN** a CSV exported by Excel in Windows-1252 is ingested
- **THEN** its accented characters decode correctly and no replacement characters appear in its context

#### Scenario: Uploaded HTML extracts as text, not tags

- **WHEN** a `text/html` file is ingested
- **THEN** its extracted text carries no HTML tags

#### Scenario: Unsupported type is rejected

- **WHEN** a file whose content type has no extractor is ingested
- **THEN** ingestion fails with an error and no attachment row is created

### Requirement: Upload validates input at the trust boundary

Ingesting an attachment SHALL, before storing it or running the model, reject a file larger than a bounded maximum size and reject an upload whose Topic does not exist, so a hostile, oversized, or misaddressed upload cannot consume storage or inference cost.

The boundary SHALL NOT trust the browser's reported content type alone. When the reported type is empty or is not one the gate knows, the type SHALL be resolved from the filename extension. A browser reports CSV as `application/vnd.ms-excel` on Windows with Excel installed, and reports the long OOXML types as `application/octet-stream` or the empty string, so a picker-offered file would otherwise be rejected as unsupported.

The boundary SHALL resolve one canonical content type and use it for storage, for extraction, and for the stored file's headers, so the three never disagree about one file.

#### Scenario: Oversized file is rejected before storage

- **WHEN** a file exceeding the maximum size is ingested
- **THEN** ingestion fails with an error, nothing is written to object storage, and the model is not called

#### Scenario: Upload to a nonexistent topic is rejected before storage

- **WHEN** an attachment is ingested for a topic id that does not exist
- **THEN** ingestion fails with an error before any object is stored or the model is called

#### Scenario: A misreported CSV is accepted by its extension

- **WHEN** a `.csv` file arrives reported as `application/vnd.ms-excel`
- **THEN** it is resolved to the canonical CSV type and accepted

#### Scenario: A typeless DOCX is accepted by its extension

- **WHEN** a `.docx` file arrives reported as `application/octet-stream` or with an empty type
- **THEN** it is resolved to the canonical DOCX type and accepted

### Requirement: Processing chunks a long document and merges bounded parallel summaries

The processing workflow SHALL extract the stored file's full text, split it into at most `MAX_CHUNKS` chunks, summarize each chunk in a parallel activity, and merge the chunk summaries into one context string bounded by a maximum output length. It SHALL record `char_count` (the extracted text length) and `chunk_count` (the number of chunks) on the attachment. The workflow SHALL be durable: an interrupted run resumes instead of stranding a half-processed attachment.

Extraction is limited to `MAX_PROCESS_CHARS`, and a document longer than that is cut there. That cut SHALL be marked in the extracted text, naming the full length, so a truncated document is summarized as a prefix instead of as the whole. `char_count` SHALL record the full extracted length, not the length after the cut.

This requirement SHALL NOT apply to a table file, which is written as table text instead of summarized.

#### Scenario: A long document is chunked, summarized in parallel, and merged

- **WHEN** the workflow processes an attachment whose extracted text exceeds one chunk
- **THEN** the text is split into at most `MAX_CHUNKS` chunks, each is summarized in its own activity, and the summaries are merged into one context bounded by the maximum output length

#### Scenario: Fan-out is bounded

- **WHEN** an extracted document would split into more than `MAX_CHUNKS` chunks
- **THEN** no more than `MAX_CHUNKS` chunks are summarized

#### Scenario: A truncated document says so

- **WHEN** a document longer than `MAX_PROCESS_CHARS` is processed
- **THEN** its extracted text includes a marker naming the full length, and `char_count` records that full length

#### Scenario: Counts are recorded

- **WHEN** processing finishes
- **THEN** the attachment's `char_count` and `chunk_count` reflect the extracted length and the number of chunks

## ADDED Requirements

### Requirement: An extraction that yields no text fails

An attachment whose extraction produces empty or whitespace-only text SHALL be marked failed with a reason naming that the file held no readable text. It SHALL NOT be marked ready.

An empty extraction currently produces no chunks, an empty merged summary, and a `ready` attachment with an empty context, so a scanned PDF with no text layer, an image-only DOCX, and a chart-only XLSX all look processed and contribute nothing to a Scan.

#### Scenario: A scanned PDF with no text layer fails

- **WHEN** an attachment's extraction yields empty or whitespace-only text
- **THEN** the attachment's status is `failed` with a reason naming that no readable text was found, and its context is not set to empty

#### Scenario: A chart-only workbook fails

- **WHEN** an XLSX whose sheets hold no cell text is processed
- **THEN** the attachment is failed with that same reason instead of going ready

### Requirement: The chat picker offers only what the chat path accepts

The chat composers' accept list SHALL NOT be derived from the Topic picker's list. Each SHALL state the types its own path accepts, so widening one never makes the other offer a file it rejects.

Every type the chat picker offers SHALL be a type the chat attachment path accepts.

#### Scenario: Widening the topic picker does not widen chat

- **WHEN** the Topic picker's accept list gains a type the chat path does not accept
- **THEN** the chat composers do not offer that type

#### Scenario: The chat picker offers nothing it will reject

- **WHEN** each type in the chat picker's accept list is posted to the chat attachment path
- **THEN** each is accepted

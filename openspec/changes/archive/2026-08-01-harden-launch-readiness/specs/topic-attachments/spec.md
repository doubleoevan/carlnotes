## MODIFIED Requirements

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

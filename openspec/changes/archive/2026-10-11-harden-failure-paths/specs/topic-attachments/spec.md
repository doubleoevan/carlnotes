## MODIFIED Requirements

### Requirement: A failed attachment leaves no orphan and never feeds a scan

Ingestion and processing fail in two different places, and each cleans up after itself. Ingestion SHALL record the
attachment's key as pending before uploading, with a grace period, and SHALL clear the pending row in the transaction
that inserts the attachment row. If the synchronous half fails, whether storing the bytes, inserting the row, or
starting the workflow, ingestion SHALL leave no attachment row and SHALL delete the stored object through
`deleteStoredObject`, and a delete that fails leaves the key pending for the sweep. If processing fails, whether
extraction, summarization, the merge, or a scanner detection on the extracted text, the workflow SHALL set the
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

- **WHEN** the scanner flags an attachment's extracted text before context generation
- **THEN** no context is generated, the attachment's `status` becomes `failed` with the scanner's reason in `error` for
  the owner to see, and its context never reaches a Scan

#### Scenario: A failed attachment is excluded from scans

- **WHEN** a Topic has only a `failed` attachment
- **THEN** its context is not part of the Topic's effective scan context

#### Scenario: A crash between the upload and the insert

- **WHEN** the api dies after storing the bytes and before inserting the row
- **THEN** the key is pending, and the sweep deletes the object after the grace period

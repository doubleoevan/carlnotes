## Purpose

Let Topic editors explicitly import selected conversations or pasted transcripts into personal Topic context without connecting an assistant account.

## ADDED Requirements

### Requirement: Export imports require conversation selection

The web editor SHALL accept supported ChatGPT and Claude JSON exports, including their ZIP containers, preview conversations, and import only those the user confirms. It SHALL reject unknown formats explicitly rather than guessing or importing all content.

#### Scenario: The sender selects two conversations
- **WHEN** an export contains ten conversations and the sender confirms two
- **THEN** only those two become Personal Source Entries under the appropriate AI Agent import Source
- **AND** unselected transcript content is not uploaded or retained by CarlNotes

#### Scenario: The sender cancels
- **WHEN** the sender cancels or selects no conversation
- **THEN** no entry, Source, context job, or quota charge is created
- **AND** local parsing buffers and object URLs are released

#### Scenario: The format is unsupported
- **WHEN** an export does not match a supported format fixture
- **THEN** the UI explains the unsupported format and offers paste without storing the file

### Requirement: Import limits apply before decompression or persistence can exhaust resources

Input bytes, decompressed archive content, and each selected upload batch SHALL respect the shared Topic attachment limit of 10 MiB. Archive traversal, excessive expansion, encrypted archives, attachments, and unsupported binary content SHALL not enter the Personal sources.

#### Scenario: A compressed archive expands beyond the limit
- **WHEN** an archive under 10 MiB would expand beyond 10 MiB
- **THEN** parsing stops with a size error and no partial import persists

#### Scenario: An archive contains unsafe paths or attachments
- **WHEN** the archive names parent-directory paths or includes non-conversation binaries
- **THEN** unsafe structure is rejected and attachments are never uploaded or fetched

#### Scenario: Exactly the supported limit is selected
- **WHEN** the normalized batch is within 10 MiB and contains supported conversations
- **THEN** the API revalidates and can accept it under the same sender/Topic edit gate

### Requirement: Imports persist until explicitly removed

Each selected conversation or confirmed pasted transcript SHALL become one `origin: import` entry with no expiry. Imports SHALL work on every plan without a live OAuth connection and SHALL not consume the daily send allowance.

#### Scenario: A free user has no connected AI Agent
- **WHEN** that user imports a supported transcript into their eligible Topic
- **THEN** it is accepted with import provenance and persists beyond 30 days

#### Scenario: A transcript is pasted
- **WHEN** the sender confirms a bounded plain-text transcript
- **THEN** it uses the transcript import Source and the same summarization/deletion behavior as export imports

### Requirement: Imports are idempotent and retain safe link boundaries

Retried import batches SHALL not duplicate accepted conversations. Extracted links SHALL follow Personal sources URL safety rules, remain bounded to 100 per conversation, and never include private chat references as global Resource candidates.

#### Scenario: A batch response is lost
- **WHEN** the same batch and conversation fingerprints are retried
- **THEN** each selected conversation has one entry and existing entries are not overwritten

#### Scenario: A transcript contains many links and a chat URL
- **WHEN** the transcript contains more than 100 safe candidate links and a private conversation reference
- **THEN** the UI reports omitted link counts, retains at most 100 candidates, and keeps the sender reference outside the queue

### Requirement: Imports remain a web-only operation

Native Topic editors SHALL identify imports as available on the web. They SHALL display and delete imported entries through the same Personal sources behavior without offering a native export-file picker.

#### Scenario: An imported conversation is opened on a phone
- **WHEN** its sender opens the Topic on iPhone or Android
- **THEN** the entry appears with import provenance and can be deleted
- **AND** the import action explains the web-only workflow

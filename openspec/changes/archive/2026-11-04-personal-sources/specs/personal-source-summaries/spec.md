## Purpose

Turn live Personal sources content into bounded reusable scoring context, with durable rebuilding, predictable spending, and immediate invalidation after removal.

## ADDED Requirements

### Requirement: Bursts produce one bounded rewrite per sender and Topic

The system SHALL coalesce changes separately for each (Topic, sender) and rewrite only that sender's context with one cheap-model call per nonempty processed revision. Work SHALL start after 30 seconds of quiet or at the five-minute debounce ceiling. A sender with no live Personal Source Entries on that Topic SHALL clear only their context without a model call.

#### Scenario: Several entries arrive together
- **WHEN** ten entries arrive within one quiet window
- **THEN** one rewrite reads the resulting live set rather than issuing ten model calls

#### Scenario: Two senders contribute to the same Topic
- **WHEN** each sender has live entries on one Topic
- **THEN** each rewrite reads only its sender's entries and produces a separate sender-only summary
- **AND** clearing one sender's entries leaves the other's summary unchanged

#### Scenario: A sender contributes to multiple Topics
- **WHEN** one delivery files into several Topics
- **THEN** each Topic independently summarizes that sender's entries, with no shared global summary

#### Scenario: Content continues arriving
- **WHEN** changes continue for more than five minutes
- **THEN** rewriting starts by the debounce ceiling and later changes are coalesced for a subsequent revision

#### Scenario: Every entry is removed
- **WHEN** the live set becomes empty
- **THEN** context is cleared and no model call is made

### Requirement: Context size does not grow with Personal sources history

Each rewrite SHALL use at most 80,000 input characters and persist at most 8,000 output characters. Truncated coverage SHALL be visible. Scans SHALL reuse each stored sender context without another summarization call. Public Topic context remains bounded at 24,000 characters; each private scoring call receives at most 8,000 characters of public context and 8,000 characters from one sender. Relevance embeddings remain bounded at 8,000 characters overall.

#### Scenario: Permanent imports exceed one model input
- **WHEN** the live set exceeds the input bound
- **THEN** deterministic allocation selects bounded text, records incomplete coverage, and preserves the originals for the sender

#### Scenario: Many entries are followed by repeated Scans
- **WHEN** Scans use the same settled revision
- **THEN** each reads the bounded stored context without re-summarizing entries
- **AND** the total context bound does not increase with the number of entries

### Requirement: Deleted text cannot return through stale work

Deletion and Source removal SHALL immediately invalidate affected context. Late results SHALL be accepted only for the still-current content revision. A pending rebuild SHALL not cause a Scan to use invalid context.

#### Scenario: Deletion occurs during generation
- **WHEN** a sender deletes an entry after generation began
- **THEN** that generation cannot become usable context and a rewrite uses the remaining live entries

#### Scenario: Settled retained context needs no scheduled rewrite
- **WHEN** no entry is added, changed, or deleted
- **THEN** the settled context remains usable without an expiry timer or age-triggered deletion

#### Scenario: A Scan starts before rebuilding finishes
- **WHEN** the Personal sources context is invalid
- **THEN** the Scan can use prompt and attachment context while reporting the pending Personal sources state
- **AND** it never includes deleted text

### Requirement: Processing survives restart without moving plaintext through workflow history

Committed changes SHALL remain discoverable for recovery after a missed signal or worker restart. Durable workflow messages SHALL contain identifiers and revisions rather than plaintext Personal sources content.

#### Scenario: The API stops before signalling
- **WHEN** an entry commits but the process stops before notifying the worker
- **THEN** recovery discovers the dirty revision and eventually processes it

#### Scenario: Workflow history is inspected
- **WHEN** a rewrite includes a private canary
- **THEN** its workflow arguments, results, logs, and telemetry contain no canary text

### Requirement: Personal sources model input remains untrusted

Raw and summarized Personal sources content SHALL be fenced with fresh per-call nonce delimiters at every text-generation boundary. Forged delimiters SHALL not escape the data region. Embedding-only calls SHALL receive stable text without random delimiters, use the sender's key, suppress content telemetry, and keep private vectors transient. Model output SHALL not authorize tool calls, change permissions, or bypass URL safety.

#### Scenario: A message contains prompt-injection instructions
- **WHEN** an entry contains forged closing tags and instructions to reveal another Topic
- **THEN** the written prompt keeps it inside the untrusted data region and no unauthorized read or action follows

#### Scenario: Identical private text is embedded on successive pages
- **WHEN** the caller repeats unchanged routing input to load the next Topic-suggestion page
- **THEN** embedding input is identical across requests, relevance ordering stays stable, and no matching Topic is repeated or skipped because of randomized input

### Requirement: Summarization is billed to the destination Topic owner

Each actual summarization attempt SHALL use the destination Topic owner's model key and Scan-style spend accounting. Sender-only summaries SHALL remain private from the paying owner. Reusing a summary in later Scans SHALL add no summarization charge. Missing or exhausted owner keys SHALL leave recoverable work without charging a sender or operator fallback.

#### Scenario: Two senders share one paying owner
- **WHEN** two senders' contexts are summarized for one Topic
- **THEN** each context is generated independently and both actual costs appear only in the Topic owner's spend
- **AND** the owner cannot read another sender's summary through billing or content endpoints

#### Scenario: One send reaches two owners' Topics
- **WHEN** one delivery creates entries in two Topics with different owners
- **THEN** each owner pays only for their Topic's separate summarization
- **AND** the sender's daily delivery allowance is charged once across the Topics

#### Scenario: A successful rewrite serves several Scans
- **WHEN** one paid rewrite is reused by three Scans
- **THEN** its summarization cost appears once in the Topic owner's spend

#### Scenario: The owner cannot fund a rewrite
- **WHEN** the owner key is absent or its spend reservation is refused
- **THEN** the sender sees a safe unavailable/budget state while entries retain their normal lifetime
- **AND** no sender or public key is used as a fallback

#### Scenario: The sender has no model key
- **WHEN** the Topic owner can fund a valid pending rewrite
- **THEN** summarization can complete without a sender key while its summary remains sender-only

#### Scenario: Topic ownership changes
- **WHEN** ownership changes before an attempt reserves spend
- **THEN** that attempt uses the new owner's key and budget
- **WHEN** ownership changes during an attempt
- **THEN** its incurred cost stays with the owner who funded it, stale output is discarded, and later work resolves the current owner

### Requirement: Private Personal sources context affects scoring without reaching external discovery

Review SHALL include eligible Personal sources context beside attachment context. External search-query generation SHALL exclude Personal sources context in this release. Any embedding derived from it SHALL remain private to that Topic's processing and shall not be persisted into shared indexes.

#### Scenario: Review and search read the same Topic
- **WHEN** a Topic contains a unique private phrase in its Personal sources
- **THEN** authorized scoring can use the phrase while search-provider queries and global vectors cannot contain it

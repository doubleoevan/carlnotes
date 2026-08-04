## ADDED Requirements

### Requirement: A Scan runs as a durable workflow, not inside its caller

A Scan SHALL run as a Temporal workflow. Every entry point — a Topic's first Scan, a manual Scan, and the scheduled sweep — SHALL start that workflow and return once it is accepted, rather than running the pipeline in its own process. A Scan SHALL therefore survive the death of whatever asked for it, since the workflow rather than the process owns the job.

The `scans` row SHALL still be written before the workflow starts, and its id SHALL be what the workflow is given. A Topic's page therefore shows a Scan already under way the moment the Topic exists, which a row written by the workflow could not do.

#### Scenario: A deploy during a Scan

- **WHEN** the process that started a Scan restarts while the Scan is still running
- **THEN** the Scan continues and reaches a terminal status, rather than leaving its row running with nothing behind it

#### Scenario: The caller does not wait

- **WHEN** an entry point starts a Scan
- **THEN** it returns as soon as the workflow is accepted, without waiting for the Scan to finish

### Requirement: A Scan resumes at its last completed stage

The pipeline SHALL run as separate activities along the seams it already has — ingest, review, and the write that ends the Scan. A Scan interrupted partway SHALL resume at the stage after the last one that completed, rather than restarting from the beginning.

What a Scan has spent SHALL pass between stages as a value each activity returns and the next receives, since an activity's arguments and results are serialized and a shared object cannot be mutated across that boundary.

#### Scenario: A crash after ingestion

- **GIVEN** a Scan whose ingest stage completed and whose review stage was interrupted
- **WHEN** the workflow resumes
- **THEN** review runs against what ingest already found, and ingestion is not paid for a second time

#### Scenario: Spend carries across stages

- **WHEN** a stage completes
- **THEN** what the Scan has spent so far, and its per-stage breakdown, reach the next stage intact

### Requirement: A stage that spends money is not retried automatically

Ingest MAY be retried, since it dedupes on canonical url and a re-run converges on the same Resources. The stage that fetches and scores SHALL NOT be retried automatically, because each attempt buys fetches and model calls again. A failure there SHALL end the Scan as failed, which is what a failure does today. The write that ends the Scan MAY be retried, being one idempotent write.

#### Scenario: A failing paid stage ends the Scan

- **WHEN** the fetch-and-scoring stage fails
- **THEN** the Scan ends as failed and the stage is not attempted again

### Requirement: One Topic never has two Scans running at once

A Scan workflow's id SHALL be derived from the Topic it scans, so the workflow engine refuses a second Scan for a Topic that already has one in flight. This refusal SHALL be what tells a caller a Scan is already running, in place of reading a running row.

#### Scenario: A manual Scan during a running Scan

- **GIVEN** a Topic whose Scan is already running
- **WHEN** the owner asks for a manual Scan
- **THEN** the request is refused as already running, and no second Scan is opened or charged

#### Scenario: The sweep meets a Scan already in flight

- **GIVEN** a scheduled Topic whose Scan is already running
- **WHEN** the sweep starts its workflow
- **THEN** the start is refused and the sweep moves on, without needing to have queried for a running row first

### Requirement: A Scan's outcome is announced by the workflow

Every announcement a Scan makes SHALL be sent from the workflow once the Scan reaches a terminal status, not from a caller's unawaited promise or a caller waiting on the Scan. A Scan that resumed after an interruption SHALL still announce itself exactly once.

What is announced SHALL follow what asked for the Scan: a manual Scan reports back to whoever fired it, a scheduled Scan sends the Topic's digest to its subscribers, and a Topic's first Scan announces nothing. A caller therefore never needs to wait for a Scan in order to announce it.

#### Scenario: An email survives a restart

- **GIVEN** a manual Scan interrupted after review and resumed
- **WHEN** the Scan finishes
- **THEN** its email is sent once, by the workflow rather than by the request that asked for it

#### Scenario: A sweep that dies still delivers its digests

- **GIVEN** a scheduled sweep that started Scans and then stopped
- **WHEN** those Scans finish
- **THEN** each Topic's digest is still sent, by the workflow rather than by the sweep

#### Scenario: Creating a Topic announces nothing

- **WHEN** a Topic's first Scan finishes
- **THEN** no digest or manual-scan email is sent, since the Topic has only just been created

### Requirement: A row with no workflow behind it is still reclaimed

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. The stale-Scan reclaim SHALL remain, closing out any Scan left running past the stale window regardless of whether a workflow was ever started for it.

#### Scenario: The workflow never starts

- **GIVEN** a Scan row written by a caller that died before starting its workflow
- **WHEN** the stale window passes
- **THEN** the row is closed out as failed rather than staying running

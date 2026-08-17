# durable-scans Specification

## Purpose
TBD - created by archiving change run-scans-on-temporal. Update Purpose after archive.
## Requirements
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

Ingest MAY be retried, since it dedupes on canonical url and a re-run converges on the same Resources.

The stage that fetches and scores MAY be retried once, and no more. It is nearly idempotent already: the Resources it loads exclude every Resource that already carries a Finding for the Topic, a Finding is keyed on Topic and Resource so re-scoring updates rather than duplicates, a persisted embedding makes re-gating free, and a completed fetch leaves stored content behind for reuse. What a second attempt pays for again is bounded to the Sources that always re-read, one Topic-context embed, and whatever had been admitted but not yet scored when the attempt died.

The cap SHALL be one retry rather than more, because the stage already isolates its per-Resource failures internally: a failure that reaches the stage boundary is either systemic, which further attempts will not fix, or a dead worker, which one retry covers. A failure after the last attempt SHALL end the Scan as failed. The write that ends the Scan MAY be retried, being one idempotent write.

#### Scenario: A dead worker during the paid stage

- **GIVEN** a Scan whose fetch-and-scoring stage was interrupted by its worker dying
- **WHEN** the stage is attempted again
- **THEN** it skips every Resource it already scored, resumes the Scan's recorded spend, and the Scan reaches a terminal status with the first attempt's Findings intact

#### Scenario: A failing paid stage ends the Scan

- **WHEN** the fetch-and-scoring stage fails on its last allowed attempt
- **THEN** the Scan ends as failed and the stage is not attempted again

### Requirement: One Topic never has two Scans running at once

A Scan workflow's id SHALL be derived from the Topic it scans, so the workflow engine rejects a second Scan for a Topic that already has one in flight. This rejection SHALL be what tells a caller a Scan is already running, in place of reading a running row.

#### Scenario: A manual Scan during a running Scan

- **GIVEN** a Topic whose Scan is already running
- **WHEN** the owner asks for a manual Scan
- **THEN** the request is rejected as already running, and no second Scan is opened or charged

#### Scenario: The sweep meets a Scan already in flight

- **GIVEN** a scheduled Topic whose Scan is already running
- **WHEN** the sweep starts its workflow
- **THEN** the start is rejected and the sweep moves on, without needing to have queried for a running row first

### Requirement: A Scan's outcome is announced by the workflow

Every announcement a Scan makes SHALL be sent from the workflow once the Scan reaches a terminal status, not from a caller's unawaited promise or a caller waiting on the Scan. A Scan that resumed after an interruption SHALL still announce itself exactly once.

What is announced SHALL follow what asked for the Scan: a manual Scan reports back to whoever fired it, a scheduled Scan sends the Topic's digest to its subscribers, and a Topic's first Scan announces nothing.

A Scan the user stopped SHALL announce nothing, whichever asked for it. A stopped manual Scan needs no report, since the user who stopped it is watching the page it would report. A stopped scheduled Scan sends no digest either: the Topic's owner is the only one who can stop it, and a digest naming a reading that was called off part way would tell subscribers the Topic was read when it was not. The Findings it kept still reach subscribers, in the next digest the Topic sends.

A caller therefore never needs to wait for a Scan in order to announce it.

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

#### Scenario: A stopped manual Scan announces nothing

- **WHEN** a manual Scan the user stopped closes
- **THEN** no manual-scan email is sent

#### Scenario: A stopped scheduled Scan sends no digest

- **GIVEN** a scheduled Scan on a Topic with subscribers
- **WHEN** the owner stops it
- **THEN** no digest is sent for it, and the Findings it kept go out with the Topic's next digest instead

### Requirement: A row with no workflow behind it is still recovered

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. Such a row SHALL be recovered from its absent dispatch marker rather than from elapsed time: it SHALL be dispatched, not closed out, since nothing about it has failed except the start.

Marking a stale Scan failed SHALL remain, but SHALL apply only to Scans that were dispatched and whose workflow then stopped reporting — the one failure an absent marker cannot describe. Its window SHALL exceed the longest duration a healthy Scan may legally run.

That longest duration SHALL be derived from a per-stage bound that includes each stage's retries, not from a single attempt per stage. A bound covering only one attempt per stage is shorter than a Scan whose stages retry, which would let the sweep close out a Scan that is still legitimately running. The derivation SHALL therefore hold under any retry policy, so that changing how often a stage retries cannot silently invalidate the stale scan window.

#### Scenario: The workflow never starts

- **GIVEN** a Scan row written by a caller that died before starting its workflow
- **WHEN** the next relay pass runs
- **THEN** its workflow is started, rather than the row being closed out as failed

#### Scenario: A dispatched workflow stops reporting

- **GIVEN** a Scan that was dispatched and whose workflow has stopped reporting
- **WHEN** the stale scan window passes
- **THEN** the Scan is closed out as failed

#### Scenario: A slow Scan is left alone

- **GIVEN** a dispatched Scan still running, within the longest duration its stages allow
- **WHEN** the sweep runs
- **THEN** the Scan is left running and nothing is reported

#### Scenario: A Scan whose stages retried to their limit

- **GIVEN** a Scan in which every stage used every attempt its retry policy allows
- **WHEN** the stale scan window is compared against how long that Scan may run
- **THEN** the window is still longer, so the Scan is not closed out while running

### Requirement: Dispatch is recorded on the Scan

A Scan SHALL record when its workflow was accepted, so that a row with no workflow behind it is identifiable from what the row says rather than from how long it has been running. The marker SHALL be written after the workflow start returns, so a row is treated as undispatched until dispatch is proven.

#### Scenario: A dispatched Scan carries its marker

- **WHEN** a Scan's workflow start is accepted
- **THEN** the Scan records that it was dispatched

#### Scenario: A Scan whose dispatch never happened

- **GIVEN** a caller that wrote a Scan row and died before its workflow started
- **WHEN** that row is read
- **THEN** it carries no dispatch marker, and is distinguishable from a Scan whose workflow is running

### Requirement: A long-running stage reports that its worker is alive

The stages that may run for tens of minutes — ingest and review — SHALL heartbeat on a fixed interval for as long as they run, so that a worker that dies is detected from the absence of the heartbeat rather than from the per-attempt timeout expiring. The heartbeat SHALL NOT report progress: it exists to prove the process is alive, and the per-attempt timeout SHALL remain the bound on a stage that is alive but stuck.

The heartbeat timeout SHALL leave enough margin above the SDK's own outbound throttle that an ordinary pause in the process cannot be mistaken for a dead worker, and SHALL detect a dead worker well inside the window after which a Topic's page reads its Scan as stale.

Reporting SHALL be a no-op when the stage is called outside a workflow, so the stage functions stay directly callable by the smoke scripts.

#### Scenario: A worker dies during review

- **GIVEN** a Scan whose review stage is running and has already written Findings
- **WHEN** the worker process is killed
- **THEN** the attempt is failed for a missed heartbeat within about two minutes, rather than after the full per-attempt timeout

#### Scenario: A stage that is alive but stuck

- **GIVEN** a stage that keeps heartbeating but never finishes
- **WHEN** its per-attempt timeout passes
- **THEN** the attempt is failed on that timeout, unchanged by the heartbeat

#### Scenario: A stage called outside a workflow

- **WHEN** a stage function is invoked directly with no activity context
- **THEN** it runs to completion and reports nothing, rather than throwing

### Requirement: A retried stage resumes what the Scan already spent

What a stage has spent SHALL be checkpointed as it runs, so that a second attempt continues from the recorded totals rather than from zero. A resumed attempt SHALL take the running totals — spend, the per-stage breakdown, and the fetch outcome counts — from the checkpoint, and SHALL take its limits from a freshly built budget, because limits are read from the environment and a checkpointed one would be stale.

A missing or malformed checkpoint SHALL fall back to the budget the stage was passed, rather than failing the stage.

#### Scenario: Review resumes after a worker death

- **GIVEN** a review attempt that spent against the Scan's budget and then died with its worker
- **WHEN** the next attempt starts
- **THEN** it continues from the recorded spend, per-stage costs, and fetch counts, so the finished Scan's cost includes the first attempt's spend

#### Scenario: A resumed stage does not regain its limits

- **GIVEN** a checkpoint recording that the Scan has already scored most of its allowed Resources
- **WHEN** the next attempt builds its budget from that checkpoint
- **THEN** the scored-resource limit and the spend limit come from the current configuration and count the already-scored Resources, rather than starting the allowance again

#### Scenario: A malformed checkpoint

- **WHEN** a stage starts with a checkpoint that is absent or does not match the expected shape
- **THEN** it uses the budget it was passed and runs normally

### Requirement: The Scan's kept count is read from its Findings

The count of what a Scan kept SHALL be counted from the Findings recorded against that Scan's id, rather than from a tally held in memory by the stage that scored them. A stage that ran more than once holds a tally covering only its own attempt, so an in-memory count would undercount a resumed Scan. The count SHALL therefore agree with the Scan's own email, which already counts by Scan id.

#### Scenario: A Scan whose review ran twice

- **GIVEN** a Scan whose first review attempt wrote Findings and then died, and whose second attempt wrote the rest
- **WHEN** the Scan finishes
- **THEN** its kept count is every Finding recorded against that Scan, not only the second attempt's

#### Scenario: The history row and the email agree

- **WHEN** a Scan finishes and its email is sent
- **THEN** the kept count on the Scan's history row equals the number of Findings the email reports

### Requirement: A cancelled workflow closes its own Scan

A Scan whose workflow is cancelled SHALL close its own row rather than be left running for the stale sweep to find. The closing write SHALL run in a scope that cancellation cannot reach, since every activity a cancelled workflow starts is otherwise cancelled the moment it starts.

The workflow SHALL treat cancellation as an outcome rather than a failure: it SHALL complete normally instead of propagating the cancellation, so that a caller waiting on its result sees a Scan that ended rather than an error to report.

#### Scenario: The row closes on cancellation
- **WHEN** a running Scan's workflow is cancelled
- **THEN** the Scan row is closed by the workflow itself, without waiting for the stale-scan sweep

#### Scenario: A cancelled Scan is not an error
- **GIVEN** a manual Scan whose caller waits on the workflow result to bill its overage
- **WHEN** the Scan is cancelled
- **THEN** the workflow completes rather than failing, and the caller reports no error


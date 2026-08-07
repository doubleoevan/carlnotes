## ADDED Requirements

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

What a stage has spent SHALL be checkpointed as it runs, so that a second attempt continues from the recorded totals rather than from zero. A resumed attempt SHALL take the running totals — spend, the per-stage breakdown, and the fetch outcome counts — from the checkpoint, and SHALL take its ceilings from a freshly built budget, because ceilings are read from the environment and a checkpointed one would be stale.

A missing or malformed checkpoint SHALL fall back to the budget the stage was passed, rather than failing the stage.

#### Scenario: Review resumes after a worker death

- **GIVEN** a review attempt that spent against the Scan's budget and then died with its worker
- **WHEN** the next attempt starts
- **THEN** it continues from the recorded spend, per-stage costs, and fetch counts, so the finished Scan's cost includes the first attempt's spend

#### Scenario: A resumed stage does not re-arm its ceilings

- **GIVEN** a checkpoint recording that the Scan has already scored most of its allowed Resources
- **WHEN** the next attempt builds its budget from that checkpoint
- **THEN** the scored-resource ceiling and the spend ceiling come from the current configuration and count the already-scored Resources, rather than starting the allowance again

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

## MODIFIED Requirements

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

### Requirement: A row with no workflow behind it is still reclaimed

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. Such a row SHALL be recovered from its absent dispatch marker rather than from elapsed time: it SHALL be dispatched, not closed out, since nothing about it has failed except the start.

The stale-Scan reclaim SHALL remain, but SHALL apply only to Scans that were dispatched and whose workflow then stopped reporting — the one failure an absent marker cannot describe. Its window SHALL exceed the longest duration a healthy Scan may legally run.

That longest duration SHALL be derived from a per-stage bound that includes each stage's retries, not from a single attempt per stage. A bound covering only one attempt per stage is shorter than a Scan whose stages retry, which would let the reclaim close out a Scan that is still legitimately running. The derivation SHALL therefore hold under any retry policy, so that changing how often a stage retries cannot silently invalidate the reclaim window.

#### Scenario: The workflow never starts

- **GIVEN** a Scan row written by a caller that died before starting its workflow
- **WHEN** the next relay pass runs
- **THEN** its workflow is started, rather than the row being closed out as failed

#### Scenario: A dispatched workflow stops reporting

- **GIVEN** a Scan that was dispatched and whose workflow has stopped reporting
- **WHEN** the reclaim window passes
- **THEN** the Scan is closed out as failed

#### Scenario: A slow Scan is left alone

- **GIVEN** a dispatched Scan still running, within the longest duration its stages allow
- **WHEN** a reclaim runs
- **THEN** the Scan is left running and nothing is reported

#### Scenario: A Scan whose stages retried to their limit

- **GIVEN** a Scan in which every stage used every attempt its retry policy allows
- **WHEN** the reclaim window is compared against how long that Scan may run
- **THEN** the window is still longer, so the Scan is not closed out while running

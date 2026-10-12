## MODIFIED Requirements

### Requirement: A row with no workflow behind it is still recovered

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. Such a
row SHALL be recovered from its absent dispatch marker instead of from elapsed time: it SHALL be dispatched, not closed
out, since nothing about it has failed except the start.

Marking a stale Scan failed SHALL remain, but SHALL apply to two cases an absent marker cannot describe. A Scan a worker
picked up whose workflow then stopped reporting SHALL be closed out once its pickup is older than the stale scan window,
measured from the pickup and never from when the row was opened or dispatched, so time a Scan spends waiting for a scan
slot before its pickup is never counted as time running. That window SHALL exceed the longest duration a healthy Scan
may legally run, its review's wait for a slot included. A dispatched Scan no worker picked up SHALL be closed out once
its dispatch is older than the queued stage timeout, a day, plus the stale margin, since Temporal has by then failed the
ingest without running it.

That longest duration SHALL be derived from each stage's schedule-to-close bound, which covers the stage's retries and
its waits for a slot, not from a single attempt per stage. A bound covering only one attempt per stage is shorter than a
Scan whose stages retry or wait, which would let the sweep close out a Scan that is still legitimately running. The
derivation SHALL therefore hold under any retry policy, so that changing how often a stage retries cannot silently
invalidate the stale scan window.

#### Scenario: The workflow never starts

- **GIVEN** a Scan row written by a caller that died before starting its workflow
- **WHEN** the next relay pass runs
- **THEN** its workflow is started, instead of the row being closed out as failed

#### Scenario: A dispatched workflow stops reporting

- **GIVEN** a Scan that a worker picked up and whose workflow has stopped reporting
- **WHEN** the stale scan window passes from the pickup
- **THEN** the Scan is closed out as failed

#### Scenario: A Scan queued inside the ingest timeout is not stale

- **GIVEN** a Scan dispatched within the queued stage timeout that no worker has picked up
- **WHEN** the sweep runs
- **THEN** the Scan is left waiting and nothing is reported

#### Scenario: A Scan queued past the ingest timeout is closed out

- **GIVEN** a Scan dispatched longer ago than the queued stage timeout and the margin, with no pickup
- **WHEN** the sweep runs
- **THEN** the Scan is closed out as failed from its dispatch

#### Scenario: A slow Scan is left alone

- **GIVEN** a picked-up Scan still running, within the longest duration its stages allow
- **WHEN** the sweep runs
- **THEN** the Scan is left running and nothing is reported

#### Scenario: A Scan whose stages retried to their limit

- **GIVEN** a Scan in which every stage used every attempt its retry policy allows
- **WHEN** the stale scan window is compared against how long that Scan may run
- **THEN** the window is still longer, so the Scan is not closed out while running

## ADDED Requirements

### Requirement: A Scan's wait for a slot is not counted against its run

The ingest and review stages' schedule-to-close timeouts SHALL be the queued stage timeout, a day, so a Scan that waits
in the queue behind a backlog, before its ingest or before its review, is not failed for having waited, while each
stage's start-to-close timeout still bounds every attempt once picked up. The stale dispatch window SHALL follow that
day, and the stale scan window SHALL cover both stages' days and the closing writes.

#### Scenario: A backlog of first scans waits instead of failing

- **GIVEN** five thousand Topics created in one hour and sixteen scan slots
- **WHEN** their first Scans wait three hours for a slot
- **THEN** each runs once picked up, and none fails for the wait

#### Scenario: A review queued behind a burst waits instead of failing

- **GIVEN** a Scan whose ingest finished while thousands of first scans wait for a slot
- **WHEN** its review waits three hours for a slot
- **THEN** the review runs once picked up, and neither Temporal nor the stale sweep fails the Scan for the wait

### Requirement: A Scan's closing writes run on their own queue

Finishing, failing, and stopping a Scan, and reporting that its email or podcast episode workflow did not start, SHALL
run on a `scan-closing` task queue that a Worker of its own polls, with eight slots per replica, so a full scan queue
never holds a Scan's closing write behind the Scans waiting to start. A closing write SHALL be bounded by its
start-to-close timeout and its attempts, not by a queue timeout. A failure of the closing write on the workflow's
failure path SHALL fail the workflow with the error that failed the Scan, not the closing write's own, and leave the row
to the stale close-out.

#### Scenario: A full queue does not hold a finish

- **GIVEN** every scan slot busy and a backlog waiting
- **WHEN** a running Scan finishes
- **THEN** its finish runs at once on the closing queue

### Requirement: A call to Temporal from the api or the sweep has a deadline

The Temporal client SHALL give up on a connect, a workflow start, and a cancel after ten seconds, so a Temporal that is
down or overloaded fails the call instead of holding the request or the sweep that made it.

#### Scenario: A manual scan against a stalled Temporal

- **WHEN** Temporal accepts the connection and never responds to a workflow start
- **THEN** the start fails after ten seconds and the api responds 503

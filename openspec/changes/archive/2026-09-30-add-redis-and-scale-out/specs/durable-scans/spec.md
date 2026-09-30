## MODIFIED Requirements

### Requirement: A row with no workflow behind it is still recovered

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. Such a row SHALL be recovered from its absent dispatch marker rather than from elapsed time: it SHALL be dispatched, not closed out, since nothing about it has failed except the start.

Marking a stale Scan failed SHALL remain, but SHALL apply to two cases an absent marker cannot describe. A Scan a worker picked up whose workflow then stopped reporting SHALL be closed out once its pickup is older than the stale scan window, measured from the pickup and never from when the row was opened or dispatched, so time a Scan spends waiting for a scan slot is never counted as time running. That window SHALL exceed the longest duration a healthy Scan may legally run. A dispatched Scan no worker picked up SHALL be closed out once its dispatch is older than the ingest stage's schedule-to-close timeout plus the closing write's timeout and the stale margin, since Temporal counts queue time against that timeout and has by then failed the ingest without running it, and the workflow's own closing write has timed out behind the same backlog.

That longest duration SHALL be derived from a per-stage bound that includes each stage's retries, not from a single attempt per stage. A bound covering only one attempt per stage is shorter than a Scan whose stages retry, which would let the sweep close out a Scan that is still legitimately running. The derivation SHALL therefore hold under any retry policy, so that changing how often a stage retries cannot silently invalidate the stale scan window.

#### Scenario: The workflow never starts

- **GIVEN** a Scan row written by a caller that died before starting its workflow
- **WHEN** the next relay pass runs
- **THEN** its workflow is started, rather than the row being closed out as failed

#### Scenario: A dispatched workflow stops reporting

- **GIVEN** a Scan that a worker picked up and whose workflow has stopped reporting
- **WHEN** the stale scan window passes from the pickup
- **THEN** the Scan is closed out as failed

#### Scenario: A Scan queued inside the ingest timeout is not stale

- **GIVEN** a Scan dispatched within the ingest stage's schedule-to-close timeout that no worker has picked up
- **WHEN** the sweep runs
- **THEN** the Scan is left waiting and nothing is reported

#### Scenario: A Scan queued past the ingest timeout is closed out

- **GIVEN** a Scan dispatched longer ago than the ingest stage's schedule-to-close timeout plus the closing write's timeout and the margin, with no pickup
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

### Requirement: Pickup is recorded on the Scan

A Scan SHALL record when a worker picked it up: the first stage's first attempt SHALL write the pickup time where none is recorded, and a retried first stage SHALL leave it, since the longest legal duration already includes every retry. A dispatched Scan with no pickup is waiting for a scan slot, distinguishable from one that is running by what the row says.

#### Scenario: Ingest records the pickup

- **WHEN** the ingest activity begins a Scan for the first time
- **THEN** the Scan's row records that moment as its pickup

#### Scenario: A retried ingest keeps the first pickup

- **WHEN** the ingest activity is attempted a second time for the same Scan
- **THEN** the pickup recorded by the first attempt is unchanged

#### Scenario: A waiting Scan has no pickup

- **WHEN** a Scan has been dispatched and every scan slot is taken
- **THEN** its row has a dispatch marker and no pickup

### Requirement: Scan concurrency is configured

The number of scan activities one worker replica runs at once SHALL come from `SCAN_CONCURRENCY`, defaulting to 8 if unset or not a whole number above zero, read the way `DATABASE_POOL_MAX` is read. Daily capacity is worker replicas × `SCAN_CONCURRENCY` × 86,400 / the mean scan duration in seconds, and `SCAN_CONCURRENCY` SHALL be set from a scan duration measured in production, never assumed.

#### Scenario: The setting takes effect

- **WHEN** the worker starts with `SCAN_CONCURRENCY=16`
- **THEN** up to sixteen scan activities run at once on that replica

#### Scenario: A bad value falls back

- **WHEN** the worker starts with `SCAN_CONCURRENCY=many`
- **THEN** eight scan activities run at once on that replica, the default

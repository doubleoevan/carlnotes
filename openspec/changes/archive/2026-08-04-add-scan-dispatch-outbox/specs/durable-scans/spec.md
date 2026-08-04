## ADDED Requirements

### Requirement: Dispatch is recorded on the Scan

A Scan SHALL record when its workflow was accepted, so that a row with no workflow behind it is identifiable from what the row says rather than from how long it has been running. The marker SHALL be written after the workflow start returns, so a row is treated as undispatched until dispatch is proven.

#### Scenario: A dispatched Scan carries its marker

- **WHEN** a Scan's workflow start is accepted
- **THEN** the Scan records that it was dispatched

#### Scenario: A Scan whose dispatch never happened

- **GIVEN** a caller that wrote a Scan row and died before its workflow started
- **WHEN** that row is read
- **THEN** it carries no dispatch marker, and is distinguishable from a Scan whose workflow is running

## MODIFIED Requirements

### Requirement: A row with no workflow behind it is still reclaimed

The `scans` row is written before its workflow starts, so a failure in that gap can leave a row no workflow owns. Such a row SHALL be recovered from its absent dispatch marker rather than from elapsed time: it SHALL be dispatched, not closed out, since nothing about it has failed except the start.

The stale-Scan reclaim SHALL remain, but SHALL apply only to Scans that were dispatched and whose workflow then stopped reporting — the one failure an absent marker cannot describe. Its window SHALL exceed the longest duration a healthy Scan may legally run, derived from the workflow's own stage timeouts so that the two cannot drift apart.

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

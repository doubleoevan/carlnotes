## ADDED Requirements

### Requirement: A Topic runs one Scan at a time

A Scan workflow's id SHALL be derived from the Topic it scans, so the workflow engine rejects a second Scan for a Topic
that already has one running. This rejection SHALL be what tells a caller a Scan is already running, in place of reading
a running row.

#### Scenario: A manual Scan during a running Scan

- **GIVEN** a Topic whose Scan is already running
- **WHEN** the owner asks for a manual Scan
- **THEN** the request is rejected as already running, and no second Scan is opened or charged

#### Scenario: The sweep meets a Scan already running

- **GIVEN** a scheduled Topic whose Scan is already running
- **WHEN** the sweep starts its workflow
- **THEN** the start is rejected and the sweep moves on, without needing to have queried for a running row first

## REMOVED Requirements

### Requirement: One Topic never has two Scans running at once

**Reason**: Its scenario "The sweep meets a Scan already in flight" now says running.

**Migration**: The requirement moves to "A Topic runs one Scan at a time", added above.

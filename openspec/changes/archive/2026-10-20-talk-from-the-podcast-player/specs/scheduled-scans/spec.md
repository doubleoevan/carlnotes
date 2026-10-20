## MODIFIED Requirements

### Requirement: The sweep takes a pending Scan

When a scheduled Topic already has a Scan row opened but never dispatched — the row a Topic's creation writes — the
sweep SHALL take that row, re-stamping its start to the moment work begins, instead of opening a second one. A new Scan
row SHALL be opened only when the Topic has no such row.

Taking SHALL key on the absent dispatch marker instead of on a running status, since an undispatched row is exactly what
taking is for and a running status also matches Scans that are dispatched and healthy.

The sweep SHALL NOT query for a running Scan to decide whether to skip a Topic. Starting the Topic's Scan workflow is
itself the check: the workflow engine rejects a second Scan for a Topic whose Scan is already running, and the sweep
treats that rejection as the Topic being busy.

#### Scenario: Taking instead of doubling

- **GIVEN** a Topic scheduled for this sweep with one Scan row opened at creation and never dispatched
- **WHEN** the sweep scans the Topic
- **THEN** that Scan row is the one processed, and the Topic still has exactly one Scan for this window

#### Scenario: A dispatched Scan is not taken

- **GIVEN** a Topic whose open Scan was already dispatched
- **WHEN** a caller asks for a Scan on that Topic
- **THEN** that row is not taken, and the request is rejected as already running

#### Scenario: A Topic whose Scan is already running

- **GIVEN** a scheduled Topic whose Scan workflow is already running
- **WHEN** the sweep tries to start it
- **THEN** the start is rejected, the sweep moves on, and no second Scan is opened

### Requirement: Manual scan rejected while running

A manual scan request for a Topic that already has a Scan running SHALL be rejected with a conflict, so a user cannot
burn a quota slot racing the sweep on work already in progress. The rejection SHALL come from the workflow engine
declining to start a second Scan for that Topic, instead of from reading a running row, so a stale row can neither cause
a false rejection nor allow a duplicate.

#### Scenario: Manual fire during a running Scan

- **GIVEN** a Topic with a Scan running
- **WHEN** the owner requests a manual scan
- **THEN** the request is rejected with a conflict and no second Scan is opened

### Requirement: The sweep dispatches Scans that were never started

The sweep SHALL start the workflow for every Scan that is still open and has no dispatch marker, before it selects the
Topics to scan, with one exception: a Scan that no user started by hand and whose owner's key budget is spent SHALL be
marked failed with the budget reason instead of started. This is the backstop for the gap between writing a Scan row and
starting its workflow, and it SHALL rely on the marker alone instead of on how long the row has been open.

Starting the workflow inline SHALL remain the ordinary path, so a Scan asked for by hand or at Topic creation begins
immediately instead of waiting for a sweep. The relay SHALL only pick up what that path failed to dispatch.

A relay start that the workflow engine rejects as already started means the Scan is already running. The relay SHALL
record it as dispatched and leave the row in place, instead of removing the row the way a caller opening a fresh one
does.

The relay SHALL start no workflow for a row that stopped running after the sweep read the row.

#### Scenario: An undispatched Scan is picked up

- **GIVEN** a Scan row opened by a caller that died before starting its workflow
- **WHEN** the sweep runs
- **THEN** that Scan's workflow is started and the Scan is recorded as dispatched

#### Scenario: A Scan dispatched inline is left alone

- **GIVEN** a Scan whose workflow was started by whoever asked for it
- **WHEN** the sweep runs
- **THEN** the relay does not start it a second time

#### Scenario: The relay meets a Scan already running

- **GIVEN** an undispatched row whose Topic already has a Scan running
- **WHEN** the relay starts its workflow
- **THEN** the start is rejected, the row is recorded as dispatched, and the row is kept

#### Scenario: Finished Scans are never re-dispatched

- **GIVEN** Scans that reached a terminal status before dispatch was recorded at all
- **WHEN** the sweep runs
- **THEN** none of them is dispatched

#### Scenario: The relay skips a Scan that stopped running

- **GIVEN** an undispatched row that was marked failed after the sweep read it
- **WHEN** the relay reaches that row
- **THEN** no workflow is started for it

#### Scenario: The relay does not start a Scan whose owner's key budget is spent

- **GIVEN** an undispatched row that no user started by hand, whose owner's key has spent its whole budget
- **WHEN** the sweep runs
- **THEN** the row is marked failed with the budget reason, and no workflow is started for it

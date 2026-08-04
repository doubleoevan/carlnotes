## ADDED Requirements

### Requirement: The sweep dispatches Scans that were never started

The sweep SHALL start the workflow for every Scan that is still open and carries no dispatch marker, before it selects the Topics to scan. This is the backstop for the gap between writing a Scan row and starting its workflow, and it SHALL rely on the marker alone rather than on how long the row has been open.

Starting the workflow inline SHALL remain the ordinary path, so a Scan asked for by hand or at Topic creation begins immediately rather than waiting for a sweep. The relay SHALL only pick up what that path failed to dispatch.

A relay start that the workflow engine refuses means the Scan is already running. The relay SHALL record it as dispatched and leave the row in place, rather than removing the row the way a caller opening a fresh one does.

#### Scenario: An undispatched Scan is picked up

- **GIVEN** a Scan row opened by a caller that died before starting its workflow
- **WHEN** the sweep runs
- **THEN** that Scan's workflow is started and the Scan is recorded as dispatched

#### Scenario: A Scan dispatched inline is left alone

- **GIVEN** a Scan whose workflow was started by whoever asked for it
- **WHEN** the sweep runs
- **THEN** the relay does not start it a second time

#### Scenario: The relay meets a Scan already running

- **GIVEN** an undispatched row whose Topic already has a Scan in flight
- **WHEN** the relay starts its workflow
- **THEN** the start is refused, the row is recorded as dispatched, and the row is kept

#### Scenario: Finished Scans are never re-dispatched

- **GIVEN** Scans that reached a terminal status before dispatch was recorded at all
- **WHEN** the sweep runs
- **THEN** none of them is dispatched

## MODIFIED Requirements

### Requirement: The sweep claims a pending Scan

When a scheduled Topic already has a Scan row opened but never dispatched — the row a Topic's creation writes — the sweep SHALL claim that row, re-stamping its start to the moment work begins, rather than opening a second one. A new Scan row SHALL be opened only when the Topic has no such row.

Claiming SHALL key on the absent dispatch marker rather than on a running status, since an undispatched row is exactly what claiming is for and a running status also matches Scans that are dispatched and healthy.

The sweep SHALL NOT query for a running Scan to decide whether to skip a Topic. Starting the Topic's Scan workflow is itself the check: the workflow engine refuses a second Scan for a Topic whose Scan is already in flight, and the sweep treats that refusal as the Topic being busy.

#### Scenario: Claiming instead of doubling

- **GIVEN** a Topic scheduled for this sweep with one Scan row opened at creation and never dispatched
- **WHEN** the sweep scans the Topic
- **THEN** that Scan row is the one processed, and the Topic still has exactly one Scan for this window

#### Scenario: A dispatched Scan is not claimed

- **GIVEN** a Topic whose open Scan was already dispatched
- **WHEN** a caller asks for a Scan on that Topic
- **THEN** that row is not claimed, and the request is refused as already running

#### Scenario: A Topic whose Scan is already running

- **GIVEN** a scheduled Topic whose Scan workflow is already in flight
- **WHEN** the sweep tries to start it
- **THEN** the start is refused, the sweep moves on, and no second Scan is opened

### Requirement: The sweep closes out hung Scans

The sweep SHALL close out, as failed, every Scan that was dispatched and has since stopped reporting past the reclaim window, before it selects the Topics to scan. A Scan that was never dispatched SHALL NOT be closed out, because nothing about it has failed and the relay starts it instead.

The reclaim window SHALL be derived from the workflow's stage timeouts and SHALL exceed the longest duration a healthy Scan may legally run, so that a Scan which is merely slow is never closed out and the window cannot drift from the timeouts it depends on.

Closing a Scan out SHALL be reported as an error and not only logged. After this narrowing the report means a dispatched workflow disappeared, which is an incident rather than routine cleanup. A reclaim SHALL also be available scoped to one Topic, so reading that Topic can close out its own hung Scan without waiting for a sweep.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a dispatched Scan that has stopped reporting past the reclaim window
- **WHEN** a reclaim runs
- **THEN** the Scan is recorded as failed with the reason it was closed out, and the reclaim is reported rather than only logged

#### Scenario: An undispatched Scan is not closed out

- **GIVEN** a Scan row open past the reclaim window that was never dispatched
- **WHEN** a reclaim runs
- **THEN** the Scan is left for the relay to start rather than recorded as failed

#### Scenario: Reading a Topic reclaims its own hung Scan

- **GIVEN** a Topic whose dispatched Scan has stopped reporting past the reclaim window
- **WHEN** that Topic's page is loaded
- **THEN** the Scan reads as failed rather than as still going, without waiting for a sweep

#### Scenario: A Scan running past the stale window is closed out

- **WHEN** a sweep runs and a dispatched Scan has stopped reporting for longer than the reclaim window
- **THEN** that Scan is marked `failed` with a reason, and its Topic becomes eligible to scan again once its frequency window has passed

#### Scenario: A Scan inside the stale window is left alone

- **WHEN** a sweep runs while a dispatched Scan has been running for less than the reclaim window
- **THEN** that Scan is left untouched, so a Scan that is merely slow is never cut short

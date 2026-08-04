## MODIFIED Requirements

### Requirement: The sweep claims a pending Scan

When a scheduled Topic already has a Scan row opened but not yet started — the row a Topic's creation writes — the sweep SHALL claim that row, re-stamping its start to the moment work begins, rather than opening a second one. A new Scan row SHALL be opened only when the Topic has no open Scan.

The sweep SHALL NOT query for a running Scan to decide whether to skip a Topic. Starting the Topic's Scan workflow is itself the check: the workflow engine refuses a second Scan for a Topic whose Scan is already in flight, and the sweep treats that refusal as the Topic being busy.

#### Scenario: Claiming instead of doubling

- **GIVEN** a Topic scheduled for this sweep with one Scan row opened at creation and never started
- **WHEN** the sweep scans the Topic
- **THEN** that Scan row is the one processed, and the Topic still has exactly one Scan for this window

#### Scenario: A Topic whose Scan is already running

- **GIVEN** a scheduled Topic whose Scan workflow is already in flight
- **WHEN** the sweep tries to start it
- **THEN** the start is refused, the sweep moves on, and no second Scan is opened

### Requirement: Topic creation opens the first Scan atomically

Creating a Topic SHALL write the Topic, its subscription, invitees, sources, and its first running Scan in one transaction. A creation failure SHALL leave none of those rows.

Once that transaction commits, creation SHALL start the Scan's workflow rather than leaving the row for the sweep to find. A Topic created while no sweep is due therefore begins scanning immediately, and the row can never sit open waiting for a process that may not be running. Creation SHALL NOT wait for the Scan, which takes minutes.

#### Scenario: Creation is all-or-nothing

- **GIVEN** a topic create request that fails after the Topic row is written
- **WHEN** the transaction aborts
- **THEN** neither the Topic nor its first Scan exists

#### Scenario: The first Scan starts without a sweep

- **GIVEN** a newly created Topic and no sweep due
- **WHEN** creation commits
- **THEN** its first Scan begins, rather than the row staying open until a sweep runs

### Requirement: Manual scan refused while running

A manual scan request for a Topic that already has a Scan in flight SHALL be refused with a conflict, so a user cannot burn a quota slot racing the sweep on work already in progress. The refusal SHALL come from the workflow engine declining to start a second Scan for that Topic, rather than from reading a running row, so a stale row can neither cause a false refusal nor allow a duplicate.

#### Scenario: Manual fire during a running Scan

- **GIVEN** a Topic with a Scan in flight
- **WHEN** the owner requests a manual scan
- **THEN** the request is refused with a conflict and no second Scan is opened

### Requirement: The sweep closes out hung Scans

The sweep SHALL close out, as failed, every Scan still running past the stale window, before it selects the Topics to scan. A Scan row is written before its workflow starts, so a caller that dies in that gap leaves a row no workflow owns, and nothing else would end it.

Closing a Scan out SHALL be reported as an error and not only logged, since a reclaimed Scan is evidence that something died rather than finished. A reclaim SHALL also be available scoped to one Topic, so reading that Topic can close out its own hung Scan without waiting for a sweep — the sweep is not the only place the reclaim may run, because the process that hosts the sweep is one of the processes that can die.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a Scan still running past the stale window
- **WHEN** a reclaim runs
- **THEN** the Scan is recorded as failed with the reason it was closed out, and the reclaim is reported rather than only logged

#### Scenario: Reading a Topic reclaims its own hung Scan

- **GIVEN** a Topic whose Scan has been running past the stale window
- **WHEN** that Topic's page is loaded
- **THEN** the Scan reads as failed rather than as still going, without waiting for a sweep

#### Scenario: A Scan running past the stale window is closed out

- **WHEN** a sweep runs and a Scan has been `running` for longer than the stale window
- **THEN** that Scan is marked `failed` with a reason, and its Topic becomes eligible to scan again once its frequency window has passed

#### Scenario: A Scan inside the stale window is left alone

- **WHEN** a sweep runs while a Scan has been `running` for less than the stale window
- **THEN** that Scan is left untouched so a legitimately slow Scan is never cut short

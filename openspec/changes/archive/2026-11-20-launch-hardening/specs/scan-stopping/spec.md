## MODIFIED Requirements

### Requirement: A stop reaches the stage that is running

Review SHALL observe its cancellation, so that a stopped Scan stops spending instead of running out its stage timeout.
It SHALL check the cancellation where it already decides whether to keep working: the per-Resource gate that defers a
Resource when the Scan is out of budget. A review that a person's stop cancelled SHALL return what it scored instead of
throwing, so the Scan closes through the same path a Scan that ran out of budget closes through. A review that a worker
shutdown cancelled SHALL throw instead, so the stage is tried again and the Scan is not closed with part of its pages.

A Resource already running when the stop arrives SHALL be allowed to finish, so the stop takes effect at a Resource
boundary instead of mid-fetch. Temporal passes the cancellation to a running stage on that stage's next heartbeat, so a
stage keeps working for up to one heartbeat interval after the Scan row closes. The Scan therefore records more Findings
and more spend than it had at the moment of the click, and both SHALL be written by the stage itself instead of by the
closing write, which runs while the stage is still winding down.

Ingestion runs every Source at once, so a stop that arrives once it is under way has nothing left to hold back. A Scan
stopped during ingestion SHALL finish ingesting and then close before review begins, which is where a Scan spends most
of what it spends.

#### Scenario: Review stops scoring
- **GIVEN** a Scan cancelled while review is scoring Resources
- **WHEN** the next Resource reaches the gate
- **THEN** it and every Resource after it are deferred unscored, and review returns what it had already scored

#### Scenario: A stop during ingestion closes before review
- **GIVEN** a Scan cancelled while its Sources are being ingested
- **WHEN** ingestion finishes
- **THEN** review never starts and the Scan closes as stopped

#### Scenario: A worker shutdown is not a stop
- **GIVEN** a Scan whose review is scoring Resources while its worker shuts down for a deploy
- **WHEN** the worker cancels the review
- **THEN** the review does not return as stopped, the stage is tried again on another worker, and the Scan is closed
  neither as stopped nor as succeeded with part of its pages

### Requirement: The topic page leaves a stopped Scan out

The topic page SHALL exclude stopped Scans from the payload it reads, so a brew the user called off never appears in the
Brew diary. A Scan nobody wanted is not a reading of the Topic, and a diary row for it would offer a note that was never
written.

The exclusion SHALL apply to everything the page derives from that history, not to the diary alone. In particular the
latest succeeded Scan, which the schedule line's timing is read from, and the newest succeeded Scan that wrote a recap,
which the Topic's own note is read from, SHALL each skip stopped Scans, because one closes as succeeded with no recap
behind it and would otherwise report a scan time with nothing to show for it.

The spend SHALL stay visible: a stopped Scan keeps its cost and still counts on the Activity page, where a Topic's brews
and their cost are accounted. Hiding the row on the topic page SHALL NOT hide the money anywhere.

#### Scenario: A stopped Scan is absent from the diary
- **WHEN** a user stops a brew and the topic page reloads
- **THEN** the Brew diary shows the Scans before it and no row for the one that was stopped

#### Scenario: A stopped Scan is not the Topic's last scan
- **GIVEN** a Topic whose most recent Scan was stopped
- **WHEN** the topic page renders its schedule line and its note
- **THEN** the schedule line reads from the last Scan that ran to the end, the note reads from the newest such Scan that
  wrote a recap, and neither reads from the stopped one

#### Scenario: The spend still shows on Activity
- **WHEN** the owner opens the Activity page after stopping a brew
- **THEN** the stopped Scan is counted there with the cost it reached, and its note carries the stopped-Scan line rather
  than the line for a Scan whose recap failed to be written

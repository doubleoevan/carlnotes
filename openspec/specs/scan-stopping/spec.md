# scan-stopping Specification

## Purpose
TBD - created by archiving change stop-a-running-scan. Update Purpose after archive.
## Requirements
### Requirement: A running Scan can be stopped from the topic page

While a Scan runs, the topic page SHALL offer a stop control beside the running line, in place of the Brew trigger it replaced. It SHALL be the icon alone, muted until hovered and carrying its name as a tooltip, the way the topic's own edit and delete actions render. Activating it SHALL cancel the Scan through the api, and the icon SHALL go on the click rather than waiting for the Scan to close, so a click that has already landed cannot be repeated. The running line stays until the Scan row leaves `running`, which the page's existing poll already watches for. The stop SHALL NOT ask for confirmation, since a stopped Scan keeps what it brewed and the user can brew again.

The api SHALL authorize the stop on authority alone — the Topic's owner or an admin — and SHALL NOT gate it on the daily quota, since the user whose last brew is running is exactly the user who needs to stop it. A stop for a Topic with nothing running SHALL be reported as such rather than as a failure.

#### Scenario: The owner stops a running Scan
- **WHEN** the Topic's owner activates the stop control while a Scan runs
- **THEN** the api cancels the Scan's workflow and the running line resolves to the stopped Scan

#### Scenario: A user out of quota can still stop
- **GIVEN** an owner whose running Scan used their last brew of the day
- **WHEN** they activate the stop control
- **THEN** the api accepts it, because stopping is authorized by ownership rather than by remaining quota

#### Scenario: Stopping a Topic with nothing running
- **WHEN** a stop arrives for a Topic whose Scan already finished
- **THEN** the api answers that nothing was running, and reports no error

#### Scenario: A non-owner who is not an admin is rejected
- **WHEN** a user who is neither the owner nor an admin stops a Topic's Scan
- **THEN** the api rejects it

### Requirement: A stop reaches the stage that is running

Review SHALL observe its cancellation, so that a stopped Scan stops spending rather than running out its stage timeout. It SHALL check the cancellation where it already decides whether to keep working: the per-Resource gate that defers a Resource when the Scan is out of budget. A cancelled review SHALL return what it scored rather than throwing, so the Scan closes through the same path a Scan that ran out of budget closes through.

A Resource already in flight when the stop arrives SHALL be allowed to finish, so the stop lands at a Resource boundary rather than mid-fetch. Temporal carries the cancellation to a running stage on that stage's next heartbeat, so a stage keeps working for up to one heartbeat interval after the Scan row closes. The Scan therefore records more Findings and more spend than it had at the moment of the click, and both SHALL be written by the stage itself rather than by the closing write, which runs while the stage is still winding down.

Ingestion runs every Source at once, so a stop that arrives once it is under way has nothing left to hold back. A Scan stopped during ingestion SHALL finish ingesting and then close before review begins, which is where a Scan spends most of what it spends.

#### Scenario: Review stops scoring
- **GIVEN** a Scan cancelled while review is scoring Resources
- **WHEN** the next Resource reaches the gate
- **THEN** it and every Resource after it are deferred unscored, and review returns what it had already scored

#### Scenario: A stop during ingestion closes before review
- **GIVEN** a Scan cancelled while its Sources are being ingested
- **WHEN** ingestion finishes
- **THEN** review never starts and the Scan closes as stopped

### Requirement: A stopped Scan keeps what it brewed and charges what it spent

A stopped Scan SHALL be closed as succeeded with a `stoppedAt` timestamp, not as failed. It SHALL keep every Finding it already wrote, SHALL record the dollars it already spent in the same per-stage breakdown and total a completed Scan records, and those dollars SHALL count against the user's monthly budget exactly as a failed Scan's partial spend does.

A stopped Scan SHALL NOT send its scan email, because the user who stopped it is watching the page it would report. It SHALL NOT write its recap either: the recap is a paid model call, and a stop means stop spending. History already has a line for a Scan with no recap, and a stopped Scan gets its own wording there.

#### Scenario: Findings written before the stop survive
- **GIVEN** a Scan that scored and kept three Findings before being stopped
- **WHEN** it closes
- **THEN** the three Findings remain on the Topic and the Scan's kept count reads three

#### Scenario: Partial spend counts against the monthly budget
- **WHEN** a stopped Scan closes having spent part of its budget
- **THEN** its recorded cost is that partial spend, and the user's monthly spend includes it

#### Scenario: A stage that outlives the closing write still records what it spent
- **GIVEN** a Scan whose review stage is still winding down when the Scan row closes
- **WHEN** that stage finishes
- **THEN** the Scan's cost, per-stage breakdown, fetch counts, and kept count are all what the stage actually reached, not what the row held at the moment it closed

#### Scenario: A stopped Scan sends no email
- **WHEN** a manual Scan is stopped by the user who started it
- **THEN** no manual-scan email is sent

### Requirement: A stopped Scan gives its daily brew back

The daily brew count SHALL exclude a Scan that was stopped, the way it already excludes a failed one, so stopping costs a user dollars for the work already done and no brew. A manual Scan that was stopped SHALL NOT be reported to Stripe as metered overage, since the daily limit it exceeded is no longer exceeded once the brew is given back.

#### Scenario: The brew count is restored
- **GIVEN** an owner with two brews left today who starts a Scan and stops it
- **WHEN** the page reloads
- **THEN** two brews are left today again

#### Scenario: A stopped overage Scan bills nothing
- **GIVEN** a subscriber past their daily limit whose extra manual Scan would bill as overage
- **WHEN** they stop that Scan
- **THEN** no usage record is reported to Stripe, while the dollars the Scan spent still count against their monthly budget

### Requirement: The topic page leaves a stopped Scan out

The topic page SHALL exclude stopped Scans from the payload it reads, so a brew the user called off never appears in the Brew diary. A Scan nobody wanted is not a reading of the Topic, and a diary row for it would offer a note that was never written.

The exclusion SHALL apply to everything the page derives from that history, not to the diary alone. In particular the latest succeeded Scan — which the schedule line's timing and the Topic's own note are read from — SHALL skip stopped Scans, since one closes as succeeded with no recap behind it and would otherwise report a scan time with nothing to show for it.

The spend SHALL stay visible: a stopped Scan keeps its cost and still counts on the Activity page, where a Topic's brews and their cost are accounted. Hiding the row on the topic page SHALL NOT hide the money anywhere.

#### Scenario: A stopped Scan is absent from the diary
- **WHEN** a user stops a brew and the topic page reloads
- **THEN** the Brew diary shows the Scans before it and no row for the one that was stopped

#### Scenario: A stopped Scan is not the Topic's last scan
- **GIVEN** a Topic whose most recent Scan was stopped
- **WHEN** the topic page renders its schedule line and its note
- **THEN** both read from the last Scan that ran to the end, not from the stopped one

#### Scenario: The spend still shows on Activity
- **WHEN** the owner opens the Activity page after stopping a brew
- **THEN** the stopped Scan is counted there with the cost it reached, and its note carries the stopped-Scan line rather than the line for a Scan whose recap failed to be written


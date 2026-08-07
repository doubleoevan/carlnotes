# scheduled-scans Specification

## Purpose
TBD - created by archiving change add-scheduled-scans-digest-reuse. Update Purpose after archive.
## Requirements
### Requirement: A scheduled sweep triggers Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic and, for each, runs the existing `runTopicScan` as a scheduled (non-manual) Scan and then sends the topic-scan email for that Scan. A sweep SHALL be idempotent: a Topic scanned in this sweep SHALL no longer be scheduled in the next one. The sweep SHALL isolate per-Topic failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary of how many Topics were scheduled, scanned, skipped over-quota, and failed. The failed count SHALL include Scans that ended with a `failed` status as well as scans that threw, since a Scan whose Sources all fail returns normally and would otherwise be reported as a clean pass, hiding a persistently failing Topic. The sweep SHALL NOT depend on Temporal, a job queue, or any added scheduling package.

#### Scenario: A scheduled Topic is scanned on its frequency

- **WHEN** a sweep runs and a Topic is scheduled by its frequency
- **THEN** `runTopicScan` runs for that Topic as a non-manual Scan and the Scan appears in the Topic's history

#### Scenario: One Topic's failure does not abort the sweep

- **WHEN** scanning one scheduled Topic throws
- **THEN** the error is logged, the sweep continues, and the remaining scheduled Topics are still scanned

#### Scenario: A Scan that ends failed is counted as failed, not scanned

- **WHEN** a scheduled Topic's Scan completes with a `failed` status because every Source failed
- **THEN** the sweep summary counts it under failed rather than scanned, so the Topic is visible in the log

#### Scenario: The sweep is safe to run repeatedly

- **WHEN** a second sweep runs immediately after a first that scanned a Topic
- **THEN** that Topic is no longer scheduled and is not scanned again

### Requirement: A Topic is scheduled by its frequency and its recent Scans, without a cursor column

A Topic SHALL be scheduled for a Scan when it has no completed (`succeeded` or `failed`) Scan whose `started_at` falls within its frequency window — 24 hours for `daily`, 7 days for `weekly` — or when it has no completed Scan at all. A Topic with an in-window `succeeded` Scan SHALL NOT be scheduled. A Topic with an in-window `failed` Scan SHALL NOT be scheduled either: a failed Scan means that frequency window found nothing, not that the Topic is owed an immediate retry, so counting only succeeded Scans would leave a Topic whose Sources all fail permanently scheduled and re-scanned by every sweep. A running Scan never spends the window: due-ness reads only completed Scans, so a Topic whose only Scan is a pending running row — whether freshly created or mid-brew — is due immediately, exactly as an unscanned Topic is. No `nextScanAt` or scheduling-cursor column SHALL be added to `topics`. Whether a Topic is scheduled is computed from `frequency` and the Scans that already exist.

#### Scenario: A recently scanned daily Topic is not scheduled

- **WHEN** a `daily` Topic has a `succeeded` Scan started less than 24 hours ago
- **THEN** it is not scheduled and the sweep does not scan it

#### Scenario: A recently failed daily Topic is not scheduled again until its window elapses

- **WHEN** a `daily` Topic's most recent Scan `failed` less than 24 hours ago
- **THEN** it is not scheduled, and it is scheduled again once 24 hours have passed, on the same window a succeeded Scan would set

#### Scenario: A daily Topic with no recent Scan is scheduled

- **WHEN** a `daily` Topic has no completed Scan started within the last 24 hours
- **THEN** it is scheduled and the sweep scans it

#### Scenario: A running Scan blocks a re-scan within the window

- **WHEN** a Topic already has a `running` Scan
- **THEN** the sweep does not open a second, concurrent Scan for it — it takes the existing running row instead, per the sweep-takes-a-pending-Scan requirement below

#### Scenario: A pending first Scan leaves the Topic due

- **GIVEN** a Topic created moments ago, holding only the running Scan opened at creation
- **WHEN** the sweep computes the scheduled Topics
- **THEN** the Topic is scheduled, since it has no completed Scan

#### Scenario: The weekly window is seven days

- **WHEN** a `weekly` Topic's most recent `succeeded` Scan started six days ago
- **THEN** it is not scheduled, and it is scheduled again once seven days have passed

### Requirement: Scheduled Scans respect the shared daily quota and skip when over it

Before scanning a scheduled Topic, the sweep SHALL check the owner's remaining daily scan quota — the same per-user, per-UTC-day, plan-based pool that counts scheduled and manual Scans alike, which admins bypass. A Topic whose owner has no remaining quota SHALL be skipped for this sweep: not scanned and not failed. It remains scheduled and is retried on a later sweep once the quota window rolls over. Over-quota skips SHALL be counted in the sweep summary.

#### Scenario: An over-quota owner's Topic is skipped, not failed

- **WHEN** a scheduled Topic's owner has already used their plan's daily scan limit
- **THEN** the sweep skips the Topic without scanning it, records no failed Scan, and the Topic stays scheduled

#### Scenario: A within-quota Topic is scanned

- **WHEN** a scheduled Topic's owner still has daily quota remaining
- **THEN** the sweep scans the Topic and the Scan counts against that quota like any other

#### Scenario: An admin-owned Topic bypasses the quota

- **WHEN** a scheduled Topic is owned by a platform admin
- **THEN** the sweep scans it regardless of how many Scans ran today

### Requirement: A model call is bounded by a timeout

Every model call routed through the LiteLLM proxy SHALL be bounded by a request timeout, configurable by the environment. A call that outlives it SHALL abort so the Scan fails and records its error, rather than leaving the Scan `running` indefinitely. Without this bound a single stalled proxy request holds a Scan open forever, which reads as a Scan still in progress rather than one that broke, and blocks the Topic from being scanned again.

#### Scenario: A stalled model call fails its Scan instead of hanging it

- **WHEN** a model request through the proxy stops responding for longer than the timeout
- **THEN** the request aborts, the Scan finishes with status `failed` and its error recorded, and the Topic is not left with a `running` Scan

### Requirement: The sweep closes out hung Scans

The sweep SHALL close out, as failed, every Scan that was dispatched and has since stopped reporting past the stale scan window, before it selects the Topics to scan. A Scan that was never dispatched SHALL NOT be closed out, because nothing about it has failed and the relay starts it instead.

The stale scan window SHALL be derived from the workflow's stage timeouts and SHALL exceed the longest duration a healthy Scan may legally run, so that a Scan which is merely slow is never closed out and the window cannot drift from the timeouts it depends on.

Closing a Scan out SHALL be reported as an error and not only logged. After this narrowing the report means a dispatched workflow disappeared, which is an incident rather than routine cleanup. The same close-out SHALL also be available scoped to one Topic, so reading that Topic can close out its own hung Scan without waiting for a sweep.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a dispatched Scan that has stopped reporting past the stale scan window
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed with the reason it was closed out, and the close-out is reported rather than only logged

#### Scenario: An undispatched Scan is not closed out

- **GIVEN** a Scan row open past the stale scan window that was never dispatched
- **WHEN** the sweep runs
- **THEN** the Scan is left for the relay to start rather than recorded as failed

#### Scenario: Reading a Topic marks its own hung Scan failed

- **GIVEN** a Topic whose dispatched Scan has stopped reporting past the stale scan window
- **WHEN** that Topic's page is loaded
- **THEN** the Scan reads as failed rather than as still going, without waiting for a sweep

#### Scenario: A Scan running past the stale window is closed out

- **WHEN** a sweep runs and a dispatched Scan has stopped reporting for longer than the stale scan window
- **THEN** that Scan is marked `failed` with a reason, and its Topic becomes eligible to scan again once its frequency window has passed

#### Scenario: A Scan inside the stale window is left alone

- **WHEN** a sweep runs while a dispatched Scan has been running for less than the stale scan window
- **THEN** that Scan is left untouched, so a Scan that is merely slow is never cut short

### Requirement: The sweep takes a pending Scan

When a scheduled Topic already has a Scan row opened but never dispatched — the row a Topic's creation writes — the sweep SHALL take that row, re-stamping its start to the moment work begins, rather than opening a second one. A new Scan row SHALL be opened only when the Topic has no such row.

Taking SHALL key on the absent dispatch marker rather than on a running status, since an undispatched row is exactly what taking is for and a running status also matches Scans that are dispatched and healthy.

The sweep SHALL NOT query for a running Scan to decide whether to skip a Topic. Starting the Topic's Scan workflow is itself the check: the workflow engine rejects a second Scan for a Topic whose Scan is already in flight, and the sweep treats that rejection as the Topic being busy.

#### Scenario: Taking instead of doubling

- **GIVEN** a Topic scheduled for this sweep with one Scan row opened at creation and never dispatched
- **WHEN** the sweep scans the Topic
- **THEN** that Scan row is the one processed, and the Topic still has exactly one Scan for this window

#### Scenario: A dispatched Scan is not taken

- **GIVEN** a Topic whose open Scan was already dispatched
- **WHEN** a caller asks for a Scan on that Topic
- **THEN** that row is not taken, and the request is rejected as already running

#### Scenario: A Topic whose Scan is already running

- **GIVEN** a scheduled Topic whose Scan workflow is already in flight
- **WHEN** the sweep tries to start it
- **THEN** the start is rejected, the sweep moves on, and no second Scan is opened

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

### Requirement: Manual scan rejected while running

A manual scan request for a Topic that already has a Scan in flight SHALL be rejected with a conflict, so a user cannot burn a quota slot racing the sweep on work already in progress. The rejection SHALL come from the workflow engine declining to start a second Scan for that Topic, rather than from reading a running row, so a stale row can neither cause a false rejection nor allow a duplicate.

#### Scenario: Manual fire during a running Scan

- **GIVEN** a Topic with a Scan in flight
- **WHEN** the owner requests a manual scan
- **THEN** the request is rejected with a conflict and no second Scan is opened

### Requirement: The sweep dispatches Scans that were never started

The sweep SHALL start the workflow for every Scan that is still open and carries no dispatch marker, before it selects the Topics to scan. This is the backstop for the gap between writing a Scan row and starting its workflow, and it SHALL rely on the marker alone rather than on how long the row has been open.

Starting the workflow inline SHALL remain the ordinary path, so a Scan asked for by hand or at Topic creation begins immediately rather than waiting for a sweep. The relay SHALL only pick up what that path failed to dispatch.

A relay start that the workflow engine rejects means the Scan is already running. The relay SHALL record it as dispatched and leave the row in place, rather than removing the row the way a caller opening a fresh one does.

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
- **THEN** the start is rejected, the row is recorded as dispatched, and the row is kept

#### Scenario: Finished Scans are never re-dispatched

- **GIVEN** Scans that reached a terminal status before dispatch was recorded at all
- **WHEN** the sweep runs
- **THEN** none of them is dispatched


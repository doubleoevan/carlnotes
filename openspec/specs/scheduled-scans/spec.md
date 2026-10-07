# scheduled-scans Specification

## Purpose
TBD - created by archiving change add-scheduled-scans-digest-reuse. Update Purpose after archive.
## Requirements
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

Before scanning a scheduled Topic, the sweep SHALL check the owner's remaining daily scan quota — the same per-user, per-UTC-day, plan-based pool that counts scheduled and manual Scans alike, which admins bypass. The sweep SHALL read each owner's remaining quota once per sweep, on the first of their Topics it reaches, and lower its own copy by one for each Scan it starts for them, so an owner with many due Topics costs one read. A Topic whose owner has no remaining quota SHALL be skipped for this sweep: not scanned and not failed. It remains scheduled and is retried on a later sweep once the quota window rolls over. The sweep SHALL NOT wait for the month's budget reset: a Topic whose owner still holds last month's key is scanned on that key, as a key keeps working until its budget is spent. Over-quota skips SHALL be counted in the sweep summary.

#### Scenario: An over-quota owner's Topic is skipped, not failed

- **WHEN** a scheduled Topic's owner has already used their plan's daily scan limit
- **THEN** the sweep skips the Topic without scanning it, records no failed Scan, and the Topic stays scheduled

#### Scenario: A within-quota Topic is scanned

- **WHEN** a scheduled Topic's owner still has daily quota remaining
- **THEN** the sweep scans the Topic and the Scan counts against that quota like any other

#### Scenario: An admin-owned Topic bypasses the quota

- **WHEN** a scheduled Topic is owned by a platform admin
- **THEN** the sweep scans it regardless of how many Scans ran today

#### Scenario: One owner, many Topics, one read

- **WHEN** an owner with two remaining scans has five due Topics
- **THEN** the sweep reads their quota once, starts two Scans, and skips three as over quota

#### Scenario: A Scan runs on a key the reset has not replaced yet

- **WHEN** a Topic comes up on the first of the month before the reset job has replaced its owner's key
- **THEN** the sweep starts its Scan on the key the owner holds, and the reset replaces the key when it runs

### Requirement: A model call is bounded by a timeout

Every model call routed through the LiteLLM proxy SHALL be bounded by a request timeout, configurable by the
environment. A call that outlives it SHALL abort so the Scan fails and records its error, instead of leaving the Scan
`running` indefinitely. Without this bound a single stalled proxy request holds a Scan open forever, which reads as a
Scan still in progress instead of one that broke, and blocks the Topic from being scanned again. Inside that bound, the
proxy SHALL give each model in its model list that the app calls its own timeout, set above the longest call that the
model makes. A streamed reply SHALL also get a limit on its first chunk. The proxy SHALL retry a call that times out
once. The worker's own timeout SHALL exceed the longest proxy timeout run twice, so the worker never aborts a call that
the proxy is still retrying.

#### Scenario: A stalled model call fails its Scan instead of hanging it

- **WHEN** a model request through the proxy stops responding for longer than the timeout
- **THEN** the request aborts, the Scan finishes with status `failed` and its error recorded, and the Topic is not left
  with a `running` Scan

#### Scenario: A hung call is retried

- **WHEN** a scoring call hangs past the score model's timeout at the proxy
- **THEN** the proxy sends the call again once, and the Resource is scored if the second call returns

#### Scenario: A long call is not cut off

- **WHEN** the score model takes 100 seconds to score a long Resource
- **THEN** neither the proxy nor the worker aborts the call, and the Resource is scored

### Requirement: The sweep closes out hung Scans

The sweep SHALL close out, as failed, every Scan that a worker picked up and that has since stopped reporting past the stale scan window, measured from the pickup and never from when the row was opened, before it selects the Topics to scan. A Scan that was never dispatched SHALL NOT be closed out, because nothing about it has failed and the relay starts it instead. A Scan that was dispatched and not yet picked up is waiting for a scan slot and SHALL NOT be closed out while its dispatch is younger than the ingest stage's schedule-to-close timeout plus the closing write's timeout and the stale margin, since the queue's backlog alert is what reports a queue that deep. Once its dispatch is older than that it SHALL be closed out, because Temporal counts queue time against that timeout and has by then failed the ingest without running it and timed out the closing write behind the same backlog, leaving a row nothing else would ever close.

The stale scan window SHALL be derived from the workflow's stage timeouts and SHALL exceed the longest duration a healthy Scan may legally run, so that a Scan which is merely slow is never closed out and the window cannot drift from the timeouts it depends on.

Closing a Scan out SHALL be reported as an error and not only logged. After this narrowing the report means a picked-up workflow disappeared, which is an incident rather than routine cleanup. The same close-out SHALL also be available scoped to one Topic, so reading that Topic can close out its own hung Scan without waiting for a sweep.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a Scan a worker picked up that has stopped reporting past the stale scan window
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed with the reason it was closed out, and the close-out is reported rather than only logged

#### Scenario: An undispatched Scan is not closed out

- **GIVEN** a Scan row open past the stale scan window that was never dispatched
- **WHEN** the sweep runs
- **THEN** the Scan is left for the relay to start rather than recorded as failed

#### Scenario: A Scan queued inside the ingest timeout is not closed out

- **GIVEN** a Scan dispatched an hour ago, inside the ingest stage's schedule-to-close timeout, that no worker has picked up
- **WHEN** the sweep runs
- **THEN** the Scan is left waiting, still counting against its owner's quota, and the queue's backlog alert is what reports the wait

#### Scenario: A Scan queued past the ingest timeout is closed out

- **GIVEN** a Scan dispatched longer ago than the ingest stage's schedule-to-close timeout plus the closing write's timeout and the margin, with no pickup
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed from its dispatch, and the close-out is reported

#### Scenario: Reading a Topic marks its own hung Scan failed

- **GIVEN** a Topic whose picked-up Scan has stopped reporting past the stale scan window
- **WHEN** that Topic's page is loaded
- **THEN** the Scan reads as failed rather than as still going, without waiting for a sweep

#### Scenario: A Scan running past the stale window is closed out

- **WHEN** a sweep runs and a picked-up Scan has stopped reporting for longer than the stale scan window
- **THEN** that Scan is marked `failed` with a reason, and its Topic becomes eligible to scan again once its frequency window has passed

#### Scenario: A Scan inside the stale window is left alone

- **WHEN** a sweep runs while a picked-up Scan has been running for less than the stale scan window
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

Once that transaction commits, creation SHALL start the Scan's workflow rather than leaving the row for the sweep to find, unless the owner's key budget is spent. A Topic created while no sweep is due therefore begins scanning immediately, and the row can never sit open waiting for a process that may not be running. Creation SHALL NOT wait for the Scan, which takes minutes.

Before it starts the workflow, creation SHALL read the owner's key budget from the LiteLLM proxy: the key's recorded spend and its maximum budget, the same check that the scheduled sweep runs. The read SHALL come before the wait for the Topic's Sources to finish their screens. If the key's spend has reached its maximum budget, creation SHALL start no workflow, and no Source of the Topic SHALL run. The first Scan SHALL instead be marked `failed` with a reason that the budget failure check recognizes, so the Topic page shows the existing budget copy with its link to the plans page. The Topic SHALL still be created, and its Sources SHALL still be screened. A first Scan that a sweep already dispatched SHALL be left running, and its row SHALL NOT be deleted. If the owner has no key yet, or the budget read fails or times out, the first Scan SHALL start as before.

The first Scan SHALL be marked failed only if the Scan is still running, no user started the Scan by hand, the Scan has no dispatch marker, and no worker has picked the Scan up. A workflow that starts for a Scan after the Scan was marked failed SHALL run no Source, and the Scan SHALL stay failed with the same reason.

#### Scenario: Creation is all-or-nothing

- **GIVEN** a topic create request that fails after the Topic row is written
- **WHEN** the transaction aborts
- **THEN** neither the Topic nor its first Scan exists

#### Scenario: The first Scan starts without a sweep

- **GIVEN** a newly created Topic and no sweep due
- **WHEN** creation commits
- **THEN** its first Scan begins, rather than the row staying open until a sweep runs

#### Scenario: A spent key budget fails the first Scan without starting it

- **GIVEN** an owner whose key has spent its whole budget
- **WHEN** the owner creates a Topic
- **THEN** the Topic exists, its first Scan is failed with the budget reason, no Source runs, and the Topic page shows "Carl hit this month's coffee budget." with a link to the plans page

#### Scenario: A first Scan that a sweep already started keeps its row

- **GIVEN** a newly created Topic whose open first Scan a sweep started before creation reached the start
- **WHEN** creation tries to start the first Scan and the start is rejected as already running
- **THEN** the first Scan's row is kept and marked dispatched, and the running Scan continues

#### Scenario: A workflow that starts for a failed Scan runs no Source

- **GIVEN** a Scan that was marked failed because of the budget before any worker picked it up
- **WHEN** a workflow that was started for the same Scan reaches its ingest stage
- **THEN** no Source runs, and the Scan stays failed with the budget reason

#### Scenario: An unreadable budget starts the first Scan

- **GIVEN** an owner whose budget read fails, or an owner with no key yet
- **WHEN** the owner creates a Topic
- **THEN** the Topic's first Scan starts as before

### Requirement: Manual scan rejected while running

A manual scan request for a Topic that already has a Scan in flight SHALL be rejected with a conflict, so a user cannot burn a quota slot racing the sweep on work already in progress. The rejection SHALL come from the workflow engine declining to start a second Scan for that Topic, rather than from reading a running row, so a stale row can neither cause a false rejection nor allow a duplicate.

#### Scenario: Manual fire during a running Scan

- **GIVEN** a Topic with a Scan in flight
- **WHEN** the owner requests a manual scan
- **THEN** the request is rejected with a conflict and no second Scan is opened

### Requirement: The sweep dispatches Scans that were never started

The sweep SHALL start the workflow for every Scan that is still open and carries no dispatch marker, before it selects the Topics to scan, with one exception: a Scan that no user started by hand and whose owner's key budget is spent SHALL be marked failed with the budget reason instead of started. This is the backstop for the gap between writing a Scan row and starting its workflow, and it SHALL rely on the marker alone rather than on how long the row has been open.

Starting the workflow inline SHALL remain the ordinary path, so a Scan asked for by hand or at Topic creation begins immediately rather than waiting for a sweep. The relay SHALL only pick up what that path failed to dispatch.

A relay start that the workflow engine rejects means the Scan is already running. The relay SHALL record it as dispatched and leave the row in place, rather than removing the row the way a caller opening a fresh one does.

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

- **GIVEN** an undispatched row whose Topic already has a Scan in flight
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

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic in one SQL query, joining each Topic to the start of its last completed Scan and applying the frequency window in the query, so the sweep never loads a Topic that is not scheduled. For each scheduled Topic it starts a scheduled (non-manual) Scan through `startTopicScan`, which runs the Scan's Temporal workflow, and that workflow sends the topic-scan email once the Scan succeeds. The sweep SHALL run under a database claim: a sweep that starts while another holds the claim SHALL exit at once, having done nothing, and return null. A sweep SHALL be idempotent: a second sweep never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose Scan is still running, and a Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, skipped over budget, and could not start. A Topic counts as could not start if starting its Scan threw. A Scan that starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

#### Scenario: A scheduled Topic is scanned on its frequency

- **WHEN** a sweep runs and a Topic is scheduled by its frequency
- **THEN** a non-manual Scan starts for that Topic through `startTopicScan` and appears in the Topic's history

#### Scenario: Only scheduled Topics are loaded

- **WHEN** a sweep runs against a thousand Topics of which forty are scheduled
- **THEN** the sweep's query returns forty rows, and no Topic that is not scheduled is read into the process

#### Scenario: One Topic's failure does not abort the sweep

- **WHEN** starting one scheduled Topic's Scan throws
- **THEN** the error is logged and reported, the sweep continues, and the remaining scheduled Topics' Scans still start

#### Scenario: A start that throws is counted as could not start

- **WHEN** starting a scheduled Topic's Scan throws
- **THEN** the sweep summary counts that Topic under could not start instead of started

#### Scenario: The sweep is safe to run repeatedly

- **WHEN** a second sweep runs right after a first that started a Topic's Scan
- **THEN** no second Scan starts for that Topic

#### Scenario: A concurrent sweep exits

- **WHEN** a second sweep starts while a first still holds the claim
- **THEN** the second returns null without reading a Topic or starting a Scan

### Requirement: A sweep runs under a database claim

The sweep SHALL take a database claim before it does any work: a transaction that tries to take a Postgres advisory lock keyed by the claim's name, held for the length of the sweep and released with the transaction however the sweep ends, including a process that dies. The claim SHALL work through the connection pooler, which keeps a transaction on one server connection. A sweep that cannot take the claim SHALL exit at once and return null. The sweep SHALL keep no in-memory guard, since the sweep runs as a cron with one process per invocation and a second process cannot see another's memory.

#### Scenario: Two crons overlap

- **WHEN** a cron starts a sweep while the previous cron's sweep still runs
- **THEN** the second takes no claim, reads no Topic, starts no Scan, and exits

#### Scenario: A dead sweep releases its claim

- **WHEN** a sweep's process dies mid-run
- **THEN** its transaction ends and the next sweep takes the claim

### Requirement: The sweep starts no Scan for an owner whose key budget is spent
Before it starts any Scans, the sweep SHALL read each scheduled Topic owner's key budget from the LiteLLM proxy once: the key's recorded spend and its maximum budget, which are the numbers that the proxy compares when it rejects a call. The reads SHALL run a few owners at a time, each under the five-second timeout on proxy admin calls. For an owner whose key's spend has reached its maximum budget, the sweep SHALL start no Scan for that owner's scheduled Topics, and no Source of those Topics SHALL run. Each of that owner's scheduled Topics SHALL instead get a Scan row with status `failed`, no dispatch, a cost of zero, and a reason that the budget failure check recognizes, so the Topic page shows the existing budget copy. A Topic whose Scan is still running SHALL get no row. The budget check SHALL come after the daily scan limit and the daily topic limit, so a Topic skipped for either of those gets no row. A Scan row that was opened earlier and never dispatched SHALL take the same check before the sweep starts it, with its own read of the owner's budget: if the key budget of the row's owner is spent, the sweep SHALL mark the row `failed` with the budget reason and SHALL start no workflow for it. A row that a user started by hand SHALL still be started, since the manual scan route checked the budget when it opened the row. The scheduled Topics of an owner with no key yet, or of an owner whose budget read fails or times out, SHALL be scanned as before. The ingest spend on Exa, TwitterAPI.io, and Firecrawl SHALL stay on the operator's account and SHALL NOT count toward the user's budget.

#### Scenario: An owner over budget gets no Scan
- **WHEN** a sweep runs and an owner's key has spent its whole budget
- **THEN** none of that owner's scheduled Topics start a Scan, none of their Sources run, and each Topic gets a failed Scan that the Topic page labels "Carl hit this month's coffee budget."

#### Scenario: The skip is recorded once per frequency window
- **WHEN** a sweep saved a failed Scan for a Topic because of the budget, and the next sweep runs inside that Topic's frequency window
- **THEN** the Topic is not selected, since the failed Scan counts as its last completed Scan

#### Scenario: A Topic with a running Scan gets no failed Scan row
- **WHEN** a sweep runs, an owner's key has spent its whole budget, and one of their scheduled Topics has a Scan still running
- **THEN** that Topic gets no failed Scan row and no second Scan starts

#### Scenario: An unreadable budget fails open
- **WHEN** the proxy does not answer an owner's budget read in time, or the owner has no key yet
- **THEN** that owner's scheduled Topics start their Scans as before

#### Scenario: Each owner's budget is read once a sweep
- **WHEN** one owner has several scheduled Topics in a sweep
- **THEN** the sweep reads that owner's budget once

#### Scenario: An undispatched Scan row whose owner's key budget is spent is marked failed
- **WHEN** a sweep finds a Scan row that was opened and never dispatched, no user started that Scan by hand, and its owner's key has spent its whole budget
- **THEN** the sweep marks the row failed with the budget reason and starts no workflow for it

#### Scenario: An undispatched manual Scan row still starts
- **WHEN** a sweep finds a manual Scan row that was opened and never dispatched
- **THEN** the sweep starts the row's workflow as before


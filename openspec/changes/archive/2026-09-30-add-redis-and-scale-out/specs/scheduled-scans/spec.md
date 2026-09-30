## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: A scheduled sweep triggers Scans for scheduled Topics
**Reason**: The sweep starts Scans on Temporal and counts a start that threw an error as could not start, so the scenario that counted a Scan ending failed describes a sweep that no longer exists. A scenario cannot be removed in place, so the requirement is restated under a new name.
**Migration**: "A scheduled sweep starts Scans for scheduled Topics" replaces this requirement.

### Requirement: The sweep replaces the keys whose budget period has ended
**Reason**: The reset ran one user at a time at the start of every sweep and, on the first of each month, matched every user with a key, holding up all scheduled scanning for as long as it took. It is its own scheduled job now.
**Migration**: The subscription-billing capability's budget period requirement names the reset job, the deploy-mechanics capability names its schedule, and the sweep scans a Topic on whatever key its owner holds instead of resetting the key itself.

## ADDED Requirements

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic in one SQL query, joining each Topic to the start of its last completed Scan and applying the frequency window in the query, so the sweep never loads a Topic that is not scheduled. For each scheduled Topic it starts a scheduled (non-manual) Scan through `startTopicScan`, which runs the Scan's Temporal workflow, and that workflow sends the topic-scan email once the Scan succeeds. The sweep SHALL run under a database claim: a sweep that starts while another holds the claim SHALL exit at once, having done nothing, and return null. A sweep SHALL be idempotent: a second sweep never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose Scan is still running, and a Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, and could not start. A Topic counts as could not start if starting its Scan threw. A Scan that starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

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

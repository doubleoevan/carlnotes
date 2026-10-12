## MODIFIED Requirements

### Requirement: A Topic is scheduled by its frequency and its recent Scans, without a cursor column

A Topic SHALL be scheduled for a Scan if it has no completed (`succeeded` or `failed`) Scan whose `started_at` falls
within its frequency window — 24 hours for `daily`, 7 days for `weekly` — or if it has no completed Scan at all. A Topic
with an in-window `succeeded` Scan SHALL NOT be scheduled. A Topic with an in-window `failed` Scan SHALL NOT be
scheduled either: a failed Scan means that frequency window found nothing, not that the Topic is owed an immediate
retry, so counting only succeeded Scans would leave a Topic whose Sources all fail permanently scheduled and re-scanned
by every sweep. A `failed` Scan that was dispatched and never picked up SHALL NOT count, since it never ran and found
nothing about the Topic; its Topic stays due. A running Scan never spends the window: due-ness reads only completed
Scans, so a Topic whose only Scan is a pending running row — whether freshly created or mid-scan — is due immediately,
exactly as an unscanned Topic is. No `nextScanAt` or scheduling-cursor column SHALL be added to `topics`. Whether a
Topic is scheduled is computed from `frequency` and the Scans that already exist.

#### Scenario: A recently scanned daily Topic is not scheduled

- **WHEN** a `daily` Topic has a `succeeded` Scan started less than 24 hours ago
- **THEN** it is not scheduled and the sweep does not scan it

#### Scenario: A recently failed daily Topic is not scheduled again until its window elapses

- **WHEN** a `daily` Topic's most recent Scan `failed` less than 24 hours ago after a worker picked it up
- **THEN** it is not scheduled, and it is scheduled again once 24 hours have passed, on the same window a succeeded Scan
  would set

#### Scenario: A Scan that failed before pickup leaves the Topic due

- **WHEN** a `daily` Topic's only recent Scan was dispatched, never picked up, and closed out as failed
- **THEN** the Topic is scheduled on the next sweep

#### Scenario: A daily Topic with no recent Scan is scheduled

- **WHEN** a `daily` Topic has no completed Scan started within the last 24 hours
- **THEN** it is scheduled and the sweep scans it

#### Scenario: A running Scan blocks a re-scan within the window

- **WHEN** a Topic already has a `running` Scan
- **THEN** the sweep does not open a second, concurrent Scan for it — it takes the existing running row instead, per the
  sweep-takes-a-pending-Scan requirement below

#### Scenario: A pending first Scan leaves the Topic due

- **GIVEN** a Topic created moments ago, holding only the running Scan opened at creation
- **WHEN** the sweep computes the scheduled Topics
- **THEN** the Topic is scheduled, since it has no completed Scan

#### Scenario: The weekly window is seven days

- **WHEN** a `weekly` Topic's most recent `succeeded` Scan started six days ago
- **THEN** it is not scheduled, and it is scheduled again once seven days have passed

### Requirement: The sweep closes out hung Scans

The sweep SHALL close out, as failed, every Scan that a worker picked up and that has since stopped reporting past the
stale scan window, measured from the pickup and never from when the row was opened, before it selects the Topics to
scan. A Scan that was never dispatched SHALL NOT be closed out, because nothing about it has failed and the relay starts
it instead. A Scan that was dispatched and not yet picked up is waiting for a scan slot and SHALL NOT be closed out
while its dispatch is younger than the queued stage timeout, a day, plus the stale margin, since the queue's backlog
alert is what reports a queue that deep. Once its dispatch is older than that it SHALL be closed out, because Temporal
has by then failed the ingest without running it, leaving a row nothing else would ever close.

The stale scan window SHALL be derived from the workflow's stage timeouts and SHALL exceed the longest duration a
healthy Scan may legally run, so that a Scan which is merely slow is never closed out and the window cannot drift from
the timeouts it depends on.

Closing a Scan out SHALL be reported as an error and not only logged. After this narrowing the report means a picked-up
workflow disappeared, which is an incident instead of routine cleanup. The same close-out SHALL also be available scoped
to one Topic, so reading that Topic can close out its own hung Scan without waiting for a sweep.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a Scan a worker picked up that has stopped reporting past the stale scan window
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed with the reason it was closed out, and the close-out is reported instead of
  only logged

#### Scenario: An undispatched Scan is not closed out

- **GIVEN** a Scan row open past the stale scan window that was never dispatched
- **WHEN** the sweep runs
- **THEN** the Scan is left for the relay to start instead of recorded as failed

#### Scenario: A Scan queued inside the ingest timeout is not closed out

- **GIVEN** a Scan dispatched an hour ago, inside the queued stage timeout, that no worker has picked up
- **WHEN** the sweep runs
- **THEN** the Scan is left waiting, still counting against its owner's quota, and the queue's backlog alert is what
  reports the wait

#### Scenario: A Scan queued past the ingest timeout is closed out

- **GIVEN** a Scan dispatched longer ago than the queued stage timeout and the margin, with no pickup
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed from its dispatch, and the close-out is reported

#### Scenario: Reading a Topic marks its own hung Scan failed

- **GIVEN** a Topic whose picked-up Scan has stopped reporting past the stale scan window
- **WHEN** that Topic's page is loaded
- **THEN** the Scan reads as failed instead of as still going, without waiting for a sweep

#### Scenario: A Scan running past the stale window is closed out

- **WHEN** a sweep runs and a picked-up Scan has stopped reporting for longer than the stale scan window
- **THEN** that Scan is marked `failed` with a reason, and its Topic becomes eligible to scan again once its frequency
  window has passed

#### Scenario: A Scan inside the stale window is left alone

- **WHEN** a sweep runs while a picked-up Scan has been running for less than the stale scan window
- **THEN** that Scan is left untouched, so a Scan that is merely slow is never cut short

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects every scheduled Topic in one SQL query, joining
each Topic to the start of its last completed Scan and applying the frequency window in the query, so the sweep never
loads a Topic that is not scheduled. Until the sweep has started as many Scans as its dispatch limit allows, it starts a
scheduled (non-manual) Scan for each scheduled Topic through `startTopicScan`, which runs the Scan's Temporal workflow,
and that workflow sends the topic-scan email once the Scan succeeds. The sweep SHALL run under a database claim: a sweep
that starts while another holds the claim SHALL exit at once, having done nothing, and return null. A sweep SHALL be
idempotent: a second sweep never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose
Scan is still running, and a Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic
failures so one Topic's error neither aborts the sweep nor stops the remaining Topics. It SHALL emit a per-sweep summary
of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, skipped over budget,
skipped over the backlog, and could not start. A Topic counts as could not start if starting its Scan threw. A Scan that
starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

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

## ADDED Requirements

### Requirement: A sweep hands Temporal no more Scans than its dispatch limit allows

A sweep SHALL start at most `SCAN_DISPATCH_LIMIT` scheduled Scans, 100 by default, minus the scan queue's current
backlog, and none if the backlog is at or past the limit. A Topic left over SHALL stay due for the next sweep and SHALL
be counted as skipped over the backlog. A backlog the sweep could not read SHALL leave the whole limit. The start of the
rows whose workflow never started SHALL NOT count against the limit, since it starts only the rows a dying caller left.

#### Scenario: A deep backlog slows dispatch

- **GIVEN** a backlog of 80 Scans waiting and 500 Topics due
- **WHEN** the sweep runs with the default limit
- **THEN** it starts 20 Scans and counts 480 Topics as skipped over the backlog

### Requirement: The sweep reports the day's spend

Each sweep SHALL read the spend the app recorded since midnight UTC across every user, the Scan, chat turn, and podcast
episode costs, and the day's signups, and log them as a `daily-spend` gauge line. If `GLOBAL_DAILY_SPEND_ALERT_USD` is
set above zero and the day's total reaches it, the sweep SHALL cross the `daily-spend` threshold. A failed read SHALL be
reported and SHALL NOT stop the sweep.

#### Scenario: A day's spend is logged

- **WHEN** a sweep runs
- **THEN** its log has the day's spend by kind, the total, and the signups

### Requirement: A manual Scan that cannot be started responds as unavailable

A manual Scan whose start throws, such as against a Temporal that cannot be reached, SHALL be reported and respond 503
with a message to try again in a minute, never a 500, and the Scan row the start opened SHALL be deleted, so the owner
can start the Scan again. A start that fails on the Temporal client's ten-second deadline may still have started the
workflow, so its row SHALL be kept.

#### Scenario: Temporal is down

- **WHEN** an owner asks for a manual Scan while the start throws
- **THEN** the response is a 503 asking them to try again in a minute, the failure is reported, and no Scan row is left

#### Scenario: A start that hits its deadline keeps its row

- **WHEN** an owner's manual Scan start fails on the Temporal client's ten-second deadline
- **THEN** the response is a 503 asking them to try again in a minute, and the Scan row the start opened is kept

## RENAMED Requirements

- FROM: `### Requirement: The sweep closes out hung Scans`
- TO: `### Requirement: The sweep reaps hung Scans`

## MODIFIED Requirements

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects scheduled Topics in SQL, joining each Topic to the
start of its last completed Scan and applying the frequency window in the query, so the sweep never loads a Topic that
is not scheduled. It SHALL read them a page at a time, the Topic whose last completed Scan is oldest first and a Topic
never scanned before any other, and SHALL stop reading once it has started as many Scans as its dispatch limit allows. A
page SHALL hold as many Topics as the sweep may still start, and no fewer than 20 or more than 200, so an owner's limits
are read for the Topics of the pages that the sweep reads and for no Topic behind them. Until the sweep has started as
many Scans as its dispatch limit allows, it starts a scheduled (non-manual) Scan for each scheduled Topic through
`startTopicScan`, which runs the Scan's Temporal workflow on the scheduled Scans' task queue, and that workflow sends
the topic-scan email once the Scan succeeds. The sweep SHALL run under a job lease: a sweep that starts while another
holds the lease SHALL exit at once, having done nothing, and return null. A sweep SHALL be idempotent: a second sweep
never starts a second Scan for a Topic, since the Scan's workflow id rejects a Topic whose Scan is still running, and a
Topic whose Scan completed is no longer scheduled. The sweep SHALL isolate per-Topic failures so one Topic's error
neither aborts the sweep nor stops the remaining Topics, with one exception: a start that fails because Temporal cannot
be reached SHALL end that sweep's scheduled starts, because every later start would meet the same failure. It SHALL emit
a per-sweep summary of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit,
skipped over budget, skipped over the backlog, left because Temporal could not be reached, and could not start. A Topic
counts as could not start if starting its Scan threw, and as left because Temporal could not be reached if it came after
such a start in that sweep or if the sweep could not read the queue. A Scan that starts and then fails is recorded on
its own row by its workflow, and the sweep does not wait for it.

#### Scenario: A scheduled Topic is scanned on its frequency

- **WHEN** a sweep runs and a Topic is scheduled by its frequency
- **THEN** a non-manual Scan starts for that Topic through `startTopicScan` and appears in the Topic's history

#### Scenario: Only scheduled Topics are loaded

- **WHEN** a sweep runs against a thousand Topics of which forty are scheduled
- **THEN** the sweep's queries return at most those forty rows, and no Topic that is not scheduled is read into the
  process

#### Scenario: One Topic's failure does not abort the sweep

- **WHEN** starting one scheduled Topic's Scan throws for a reason other than a Temporal that cannot be reached
- **THEN** the error is logged and reported, the sweep continues, and the remaining scheduled Topics' Scans still start

#### Scenario: A start that throws is counted as could not start

- **WHEN** starting a scheduled Topic's Scan throws
- **THEN** the sweep summary counts that Topic under could not start instead of started

#### Scenario: The sweep is safe to run repeatedly

- **WHEN** a second sweep runs right after a first that started a Topic's Scan
- **THEN** no second Scan starts for that Topic

#### Scenario: A concurrent sweep exits

- **WHEN** a second sweep starts while a first still holds the lease
- **THEN** the second returns null without reading a Topic or starting a Scan

#### Scenario: The Topic that waited longest starts first

- **GIVEN** 2,700 scheduled Topics and a sweep that may start five Scans
- **WHEN** the sweep runs
- **THEN** it starts the five whose last completed Scan is oldest, a Topic never scanned before any other, and reads no
  owner's limits past the page it stopped on

#### Scenario: An unreachable Temporal ends the scheduled starts

- **GIVEN** 500 scheduled Topics and a Temporal that cannot be reached
- **WHEN** the sweep's first start fails on the connection
- **THEN** the sweep makes no further start in that run, reports the failure once, counts the first Topic as could not
  start and the other 499 as left because Temporal could not be reached, and every Topic stays scheduled

### Requirement: The sweep starts no Scan for an owner whose key budget is spent
Before it starts the Scans of a page of scheduled Topics, the sweep SHALL read the key budget of each owner on that page
from the LiteLLM proxy once: the key's recorded spend and its maximum budget, which are the numbers that the proxy
compares when it rejects a call. A read SHALL go through a cache of at most one minute, so sweeps a minute apart do not
each call the proxy for the same owner. The reads SHALL run a few owners at a time, each under the five-second timeout
on proxy admin calls. For an owner whose key's spend has reached its maximum budget, the sweep SHALL start no Scan for
that owner's scheduled Topics, and no Source of those Topics SHALL run. Each of that owner's scheduled Topics SHALL
instead get a Scan row with status `failed`, no dispatch, a cost of zero, and a reason that the budget failure check
recognizes, so the Topic page shows the existing budget copy. A Topic whose Scan is still running SHALL get no row. The
budget check SHALL come after the daily scan limit and the daily topic limit, so a Topic skipped for either of those
gets no row. A Scan row that was opened earlier and never dispatched SHALL take the same check before the sweep starts
it, with its own read of the owner's budget: if the key budget of the row's owner is spent, the sweep SHALL mark the row
`failed` with the budget reason and SHALL start no workflow for it. A row that a user started by hand SHALL still be
started, since the manual scan route checked the budget when it opened the row. The scheduled Topics of an owner with no
key yet, or of an owner whose budget read fails or times out, SHALL be scanned as before. The ingest spend on Exa,
TwitterAPI.io, and Firecrawl SHALL stay on the operator's account and SHALL NOT count toward the user's budget.

#### Scenario: An owner over budget gets no Scan
- **WHEN** a sweep runs and an owner's key has spent its whole budget
- **THEN** none of that owner's scheduled Topics start a Scan, none of their Sources run, and each Topic gets a failed
  Scan that the Topic page labels "Carl hit this month's coffee budget."

#### Scenario: The skip is recorded once per frequency window
- **WHEN** a sweep saved a failed Scan for a Topic because of the budget, and the next sweep runs inside that Topic's
  frequency window
- **THEN** the Topic is not selected, since the failed Scan counts as its last completed Scan

#### Scenario: A Topic with a running Scan gets no failed Scan row
- **WHEN** a sweep runs, an owner's key has spent its whole budget, and one of their scheduled Topics has a Scan still
  running
- **THEN** that Topic gets no failed Scan row and no second Scan starts

#### Scenario: An unreadable budget fails open
- **WHEN** the proxy does not answer an owner's budget read in time, or the owner has no key yet
- **THEN** that owner's scheduled Topics start their Scans as before

#### Scenario: Each owner's budget is read once a sweep
- **WHEN** one owner has several scheduled Topics in a sweep
- **THEN** the sweep reads that owner's budget at most once, and a sweep inside the same minute reads it from the cache

#### Scenario: An undispatched Scan row whose owner's key budget is spent is marked failed
- **WHEN** a sweep finds a Scan row that was opened and never dispatched, no user started that Scan by hand, and its
  owner's key has spent its whole budget
- **THEN** the sweep marks the row failed with the budget reason and starts no workflow for it

#### Scenario: An undispatched manual Scan row still starts
- **WHEN** a sweep finds a manual Scan row that was opened and never dispatched
- **THEN** the sweep starts the row's workflow as before

### Requirement: A sweep hands Temporal no more Scans than its dispatch limit allows

A sweep SHALL start at most `SCAN_DISPATCH_LIMIT` scheduled Scans, 100 by default, minus the current backlog of the
scheduled Scans' task queue, and none if the backlog is at or past the limit. A Topic left over SHALL stay due for the
next sweep and SHALL be counted as skipped over the backlog. If the read of that backlog fails, the sweep SHALL start no
scheduled Scan in that run, because a start would meet the same Temporal, and the failed read SHALL be reported. The
relay of the rows whose workflow never started SHALL have its own allowance of the same size and SHALL NOT count against
the scheduled Scans' limit.

#### Scenario: A deep backlog slows dispatch

- **GIVEN** a backlog of 80 scheduled Scans waiting on their queue and 500 Topics due
- **WHEN** the sweep runs with the default limit
- **THEN** it starts 20 Scans and counts 480 Topics as skipped over the backlog

#### Scenario: A backlog of first Scans does not slow scheduled dispatch

- **GIVEN** 300 first Scans waiting on `topic-scans`, an empty scheduled queue, and 500 Topics due
- **WHEN** the sweep runs with the default limit
- **THEN** it starts 100 scheduled Scans

#### Scenario: An unreadable backlog starts no scheduled Scan

- **WHEN** the sweep's read of the scheduled queue's backlog fails
- **THEN** it starts no scheduled Scan in that run, the failed read is reported, and every Topic stays due

### Requirement: The sweep reports the day's spend

Each sweep SHALL read the spend the app recorded since midnight UTC across every user and the platform, and the day's
signups, and log them as a `daily-spend` gauge line. The spend SHALL sum every table that records a cost: Scans, chat
turns, Podcast Episodes, Topic Post Discussions, films, Personal sources summaries, topic image renders, and the
`spends` table, whose rows with no user are logged as the platform's spend. The read SHALL go through a cache of at most
five minutes that never outlives its UTC day, and a failed read SHALL NOT be cached. If `GLOBAL_DAILY_SPEND_ALERT_USD`
is set above zero and the day's total reaches it, the sweep SHALL cross the `daily-spend` threshold. A failed read SHALL
be reported and SHALL NOT stop the sweep.

#### Scenario: A day's spend is logged

- **WHEN** a sweep runs
- **THEN** its log has the day's spend by kind, the platform's spend among the kinds, the total, and the signups

#### Scenario: The platform's film cost is in the day's total

- **GIVEN** a backfill that re-rendered films today on the platform's bill
- **WHEN** a sweep logs the day's spend
- **THEN** the total includes the platform's spend, and the alert threshold reads that total

#### Scenario: Two sweeps a minute apart sum the spend once

- **WHEN** two sweeps run a minute apart
- **THEN** the second logs the day's spend from the cache, with no new sum

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

- **WHEN** a `daily` Topic's only recent Scan was dispatched, never picked up, and reaped as failed
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

### Requirement: The sweep reaps hung Scans

The sweep SHALL reap, as failed, every Scan that a worker picked up and that has since stopped reporting past the
stale scan window, measured from the pickup and never from when the row was opened, before it selects the Topics to
scan. A Scan that was never dispatched SHALL NOT be reaped, because nothing about it has failed and the relay starts
it instead. A Scan that was dispatched and not yet picked up is waiting for a scan slot and SHALL NOT be reaped
while its dispatch is younger than the queued stage timeout, a day, plus the stale margin, since the queue's backlog
alert is what reports a queue that deep. Once its dispatch is older than that it SHALL be reaped, because Temporal
has by then failed the ingest without running it, leaving a row nothing else would ever close.

The stale scan window SHALL be derived from the workflow's stage timeouts and SHALL exceed the longest duration a
healthy Scan may legally run, so that a Scan which is merely slow is never reaped and the window cannot drift from
the timeouts it depends on.

Reaping a Scan SHALL be reported as an error and not only logged. After this narrowing the report means a picked-up
workflow disappeared, which is an incident instead of routine cleanup. The same reaper SHALL also be available scoped
to one Topic, so reading that Topic can reap its own hung Scan without waiting for a sweep.

#### Scenario: A hung Scan is closed out and reported

- **GIVEN** a Scan a worker picked up that has stopped reporting past the stale scan window
- **WHEN** the sweep runs
- **THEN** the Scan is recorded as failed with the reason it was reaped, and the reaper reports it instead of only
  logging it

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
- **THEN** the Scan is recorded as failed from its dispatch, and the reaper reports it

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

## MODIFIED Requirements

### Requirement: A scheduled sweep starts Scans for scheduled Topics

The worker SHALL expose a `runScheduledTopicScans` sweep that selects scheduled Topics in SQL, joining each Topic to the
start of its last completed Scan and applying the frequency window in the query, so the sweep never loads a Topic that
is not scheduled. It SHALL read them a page at a time, the Topic whose last completed Scan is oldest first and a Topic
never scanned before any other, and SHALL stop reading once it has started as many Scans as its dispatch limit allows,
so an owner's limits are read only for Topics that this sweep can start. Until the sweep has started as many Scans as
its dispatch limit allows, it starts a scheduled (non-manual) Scan for each scheduled Topic through `startTopicScan`,
which runs the Scan's Temporal workflow on the scheduled Scans' task queue, and that workflow sends the topic-scan email
once the Scan succeeds. The sweep SHALL run under a job lease: a sweep that starts while another holds the lease SHALL
exit at once, having done nothing, and return null. A sweep SHALL be idempotent: a second sweep never starts a second
Scan for a Topic, since the Scan's workflow id rejects a Topic whose Scan is still running, and a Topic whose Scan
completed is no longer scheduled. The sweep SHALL isolate per-Topic failures so one Topic's error neither aborts the
sweep nor stops the remaining Topics, with one exception: a start that fails because Temporal cannot be reached SHALL
end that sweep's scheduled starts, because every later start would meet the same failure. It SHALL emit a per-sweep
summary of how many Topics were scheduled, started, skipped over quota, skipped past the daily topic limit, skipped over
budget, skipped over the backlog, and could not start. A Topic counts as could not start if starting its Scan threw. A
Scan that starts and then fails is recorded on its own row by its workflow, and the sweep does not wait for it.

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
- **THEN** the sweep makes no further start in that run, reports the failure once, and every Topic stays scheduled

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

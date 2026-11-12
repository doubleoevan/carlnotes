# Spec Delta

## MODIFIED Requirements

### Requirement: Topic creation opens the first Scan atomically

Creating a Topic SHALL write the Topic, its subscription, invitees, sources, and its first running Scan in one
transaction. A creation failure SHALL leave none of those rows.

Once that transaction commits, creation SHALL start the Scan's workflow rather than leaving the row for the sweep to
find, unless the owner's key budget is spent or the first Scan dispatch limit applies to the first Scan. A Topic created
while no sweep is due therefore begins scanning immediately, and the row can never sit open waiting for a process that
may not be running, except as a Waiting Scan that a sweep starts under the first Scan dispatch limit. Creation SHALL NOT
wait for the Scan, which takes minutes.

Before it starts the workflow, creation SHALL read the owner's key budget from the LiteLLM proxy: the key's recorded
spend and its maximum budget, the same check that the scheduled sweep runs. The read SHALL come before the wait for the
Topic's Sources to finish their screens. If the key's spend has reached its maximum budget, creation SHALL start no
workflow, and no Source of the Topic SHALL run. The first Scan SHALL instead be marked `failed` with a reason that the
budget failure check recognizes, so the Topic page shows the existing budget copy with its link to the plans page. The
Topic SHALL still be created, and its Sources SHALL still be screened. A first Scan that a sweep already dispatched
SHALL be left running, and its row SHALL NOT be deleted. If the owner has no key yet, or the budget read fails or times
out, the first Scan SHALL start as before.

After the budget reads, if the first Scan dispatch limit applies to the first Scan, creation SHALL start no workflow and
SHALL leave the row running and undispatched for a sweep to start with the creation trigger. Creation SHALL still start
the screens of the Topic's url Sources, without waiting for them. A failed read of the cutoff state or the settings
SHALL start the first Scan as before.

The first Scan SHALL be marked failed only if the Scan is still running, no user started the Scan by hand, the Scan has
no dispatch marker, and no worker has picked the Scan up. A workflow that starts for a Scan after the Scan was marked
failed SHALL run no Source, and the Scan SHALL stay failed with the same reason.

#### Scenario: Creation is all-or-nothing

- **GIVEN** a topic create request that fails after the Topic row is written
- **WHEN** the transaction aborts
- **THEN** neither the Topic nor its first Scan exists

#### Scenario: The first Scan starts without a sweep

- **GIVEN** a newly created Topic, no sweep due, and a first Scan that the first Scan dispatch limit does not apply to
- **WHEN** creation commits
- **THEN** its first Scan begins, rather than the row staying open until a sweep runs

#### Scenario: A spent key budget fails the first Scan without starting it

- **GIVEN** an owner whose key has spent its whole budget
- **WHEN** the owner creates a Topic
- **THEN** the Topic exists, its first Scan is failed with the budget reason, no Source runs, and the Topic page shows
  "Carl hit this month's coffee budget." with a link to the plans page

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

#### Scenario: A first Scan the dispatch limit applies to waits for a sweep

- **GIVEN** a free owner and a passed scheduled scans cutoff
- **WHEN** the owner creates a Topic
- **THEN** its first Scan row stays running and undispatched, its url Sources are screened, and no workflow starts until
  a sweep starts it under the first Scan dispatch limit

#### Scenario: An unreadable cutoff state starts the first Scan

- **GIVEN** a free owner and a cutoff state read that fails
- **WHEN** the owner creates a Topic
- **THEN** the Topic's first Scan starts at once, as it would below every cutoff

### Requirement: The sweep dispatches Scans that were never started

The sweep SHALL start the workflow for each Scan that is still open and has no dispatch marker, before it selects the
Topics to scan, with two exceptions. A Scan that no user started by hand, that is not a Waiting Scan, and whose owner's
key budget is spent SHALL be marked failed with the budget reason instead of started. A Waiting Scan SHALL be left to
the first Scan dispatch limit, which starts the oldest Waiting Scans up to its number, with no key budget read. This is
the backstop for the gap between writing a Scan row and starting its workflow, and it SHALL rely on the marker alone
instead of on how long the row has been open.

The rows that are not Waiting Scans SHALL start oldest first, up to `SCAN_DISPATCH_LIMIT` less the scan queue's
backlog, and a row left over SHALL wait for the next sweep with its Topic counted as waiting.

The relay SHALL start each Scan with the trigger it was opened for: manual for a Scan a user started by hand, creation
for a Topic's first Scan, and scheduled for any other.

Starting the workflow inline SHALL remain the ordinary path, so a Scan asked for by hand or at Topic creation begins
immediately instead of waiting for a sweep, unless it is a Waiting Scan. The relay SHALL only pick up what that path
failed to dispatch or left waiting.

A relay start that the workflow engine rejects as already started means the Scan is already running. The relay SHALL
record it as dispatched and leave the row in place, instead of removing the row the way a caller opening a fresh one
does.

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

- **GIVEN** an undispatched row whose Topic already has a Scan running
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

- **GIVEN** an undispatched row that no user started by hand and that is not a Waiting Scan, whose owner's key has
  spent its whole budget
- **WHEN** the sweep runs
- **THEN** the row is marked failed with the budget reason, and no workflow is started for it

#### Scenario: Undispatched Scans past the dispatch limit start on the next sweep

- **GIVEN** 150 undispatched Scans that are not Waiting Scans and an empty scan queue
- **WHEN** the sweep runs with the default dispatch limit
- **THEN** the 100 oldest start, and the other 50 start on the next sweep

#### Scenario: The relay starts an orphaned first Scan with the creation trigger

- **GIVEN** a Topic's first Scan row whose creator died before starting it, and no first Scan dispatch limit that
  applies to it
- **WHEN** the sweep runs
- **THEN** the first Scan starts with the creation trigger, and its Podcast Episode records on the standard speech tier

### Requirement: A sweep hands Temporal no more Scans than its dispatch limit allows

A sweep SHALL start at most `SCAN_DISPATCH_LIMIT` scheduled Scans, 100 by default, minus the scan queue's current
backlog, and none if the backlog is at or past the limit. A Topic left over SHALL stay due for the next sweep and SHALL
be counted as skipped over the backlog. A backlog the sweep could not read SHALL leave the whole limit. The relay of the
rows whose workflow never started SHALL have its own allowance of the same size and SHALL NOT count against the
scheduled Scans' limit.

#### Scenario: A deep backlog slows dispatch

- **GIVEN** a backlog of 80 Scans waiting and 500 Topics due
- **WHEN** the sweep runs with the default limit
- **THEN** it starts 20 Scans and counts 480 Topics as skipped over the backlog

## ADDED Requirements

### Requirement: The sweep reports an hour of signups past a threshold

Each sweep SHALL count the accounts created in the past hour and, at or above the signup alert threshold, 50 by
default, cross the `hourly-signups` threshold through the existing threshold reporting. The signup alert SHALL pause,
slow, or skip nothing. A failed count SHALL be reported and SHALL NOT stop the sweep.

#### Scenario: An hour of signups past the threshold is reported

- **GIVEN** the default signup alert threshold of 50
- **WHEN** a sweep counts 64 accounts created in the past hour
- **THEN** the `hourly-signups` threshold is crossed with the count, and every Scan the sweep would start still starts

#### Scenario: An hour under the threshold is quiet

- **WHEN** a sweep counts 12 accounts created in the past hour
- **THEN** no threshold is crossed
